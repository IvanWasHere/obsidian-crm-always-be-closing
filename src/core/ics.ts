import type { CrmSnapshot } from './CrmSnapshot';
import { DEFAULT_DURATION, minutes } from './calendar';
import { addDays } from './dates';
import type { Interaction } from './types';

/** Escapes text values (RFC 5545 §3.3.11). */
function escape(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets (RFC 5545 §3.1), without splitting a UTF-8 character. */
function fold(line: string): string {
	const encoder = new TextEncoder();
	const parts: string[] = [];
	let current = '';
	for (const ch of line) {
		const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
		if (encoder.encode(current + ch).length > limit) {
			parts.push(current);
			current = ch;
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts.join('\r\n ');
}

const compactDate = (date: string) => date.replace(/-/g, '');

function localDateTime(date: string, totalMinutes: number): string {
	const dayOffset = Math.floor(totalMinutes / (24 * 60));
	const m = totalMinutes % (24 * 60);
	const d = addDays(date, dayOffset);
	return `${compactDate(d)}T${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
}

/** A stable UID per note, so re-importing updates the event instead of duplicating it. */
function uid(path: string): string {
	let h = 5381;
	for (let i = 0; i < path.length; i++) h = ((h * 33) ^ path.charCodeAt(i)) >>> 0;
	return `${h.toString(36)}-${path.length}@always-be-closing`;
}

/**
 * VEVENT lines for a dated interaction. Times are "floating" (no time zone),
 * so calendar apps show them at the same clock time wherever you are.
 */
function vevent(i: Interaction, crm: CrmSnapshot, stamp: string): string[] {
	const contacts = crm.contactsOf(i.path);
	const project = crm.projectOf(i.path);
	const lines = ['BEGIN:VEVENT', `UID:${uid(i.path)}`, `DTSTAMP:${stamp}`];
	if (i.time) {
		const start = minutes(i.time);
		lines.push(`DTSTART:${localDateTime(i.date!, start)}`);
		lines.push(`DTEND:${localDateTime(i.date!, start + (i.duration ?? DEFAULT_DURATION))}`);
	} else {
		lines.push(`DTSTART;VALUE=DATE:${compactDate(i.date!)}`);
		lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(i.date!, 1))}`);
	}
	const title = i.summary ?? `${i.kind[0]!.toUpperCase()}${i.kind.slice(1)} with ${contacts.map((c) => c.name).join(', ') || '…'}`;
	lines.push(`SUMMARY:${escape(title)}`);
	if (i.location) lines.push(`LOCATION:${escape(i.location)}`);
	const description = [
		contacts.length ? `With: ${contacts.map((c) => c.name).join(', ')}` : '',
		project ? `Project: ${project.name}` : '',
	].filter(Boolean);
	if (description.length) lines.push(`DESCRIPTION:${escape(description.join('\n'))}`);
	for (const c of contacts) {
		if (c.email) lines.push(`ATTENDEE;CN=${escape(c.name).replace(/:/g, '')};RSVP=TRUE:mailto:${c.email}`);
	}
	lines.push('END:VEVENT');
	return lines;
}

/** An iCalendar file with one event per interaction (undated ones are skipped). */
export function toIcs(interactions: readonly Interaction[], crm: CrmSnapshot, now = new Date()): string {
	const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Always Be Closing//Obsidian CRM//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		...interactions.filter((i) => i.date).flatMap((i) => vevent(i, crm, stamp)),
		'END:VCALENDAR',
	];
	return lines.map(fold).join('\r\n') + '\r\n';
}
