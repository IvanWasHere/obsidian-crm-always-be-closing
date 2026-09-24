import type { CrmSnapshot } from './CrmSnapshot';
import { isOverdue } from './billing';
import { addDays } from './dates';
import { isClosedStage } from './insights';
import type { DateString, Interaction, InteractionKind } from './types';

/** What an event is. Each has a fixed color slot, icon and toggle in the calendar. */
export type EventCategory = 'meeting' | 'interaction' | 'follow-up' | 'invoice-due' | 'deal-close';

export const EVENT_CATEGORIES: readonly EventCategory[] = ['meeting', 'follow-up', 'invoice-due', 'deal-close', 'interaction'];

export interface CalendarEvent {
	/** Unique per event (a note can produce more than one). */
	id: string;
	category: EventCategory;
	/** Note to open when the event is clicked. */
	path: string;
	date: DateString;
	/** `HH:MM`; untimed events are all-day. */
	time?: string;
	/** Minutes; only for timed events. */
	duration?: number;
	title: string;
	detail?: string;
	/** Past due (follow-ups, invoices, deal closes). */
	overdue?: boolean;
	kind?: InteractionKind;
}

/** Default length of a timed event without a `duration`. */
export const DEFAULT_DURATION = 30;

/**
 * An interaction is shown as a scheduled meeting if it's a meeting, or if it's
 * dated in the future (a call or message someone planned). Everything else
 * is past activity.
 */
export function isScheduled(i: Interaction, today: DateString): boolean {
	return i.kind === 'meeting' || (i.date !== undefined && i.date > today);
}

/** Minutes since midnight for `HH:MM`. */
export function minutes(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

/** Events dated from `from` up to (not including) `to`, sorted by date, then time (all-day first). */
export function calendarEvents(
	crm: CrmSnapshot,
	from: DateString,
	to: DateString,
	today: DateString,
	include: ReadonlySet<EventCategory> = new Set(EVENT_CATEGORIES),
): CalendarEvent[] {
	const events: CalendarEvent[] = [];
	const inRange = (d: DateString | undefined): d is DateString => d !== undefined && d >= from && d < to;

	for (const i of crm.all('interaction')) {
		if (!inRange(i.date)) continue;
		const category = isScheduled(i, today) ? 'meeting' : 'interaction';
		if (!include.has(category)) continue;
		const people = crm.contactsOf(i.path).map((c) => c.name);
		events.push({
			id: i.path,
			category,
			path: i.path,
			date: i.date,
			time: i.time,
			duration: i.time ? (i.duration ?? DEFAULT_DURATION) : undefined,
			title: i.summary ?? (people.length ? `${capitalize(i.kind)} with ${people.join(', ')}` : i.name),
			detail: [i.summary ? people.join(', ') : '', i.location].filter(Boolean).join(' · ') || undefined,
			kind: i.kind,
		});
	}

	if (include.has('follow-up')) {
		for (const c of crm.all('contact')) {
			if (c.status === 'archived' || !inRange(c.nextFollowUp)) continue;
			events.push({
				id: `${c.path}#follow-up`,
				category: 'follow-up',
				path: c.path,
				date: c.nextFollowUp,
				title: `Follow up: ${c.name}`,
				detail: crm.companyOf(c.path)?.name,
				overdue: c.nextFollowUp < today,
			});
		}
	}

	if (include.has('invoice-due')) {
		for (const inv of crm.all('invoice')) {
			if (inv.status !== 'sent' || !inRange(inv.due)) continue;
			events.push({
				id: `${inv.path}#due`,
				category: 'invoice-due',
				path: inv.path,
				date: inv.due,
				title: `${inv.name} due`,
				detail: crm.companyOf(inv.path)?.name,
				overdue: isOverdue(inv, today),
			});
		}
	}

	if (include.has('deal-close')) {
		for (const d of crm.all('deal')) {
			if (isClosedStage(d.stage) || !inRange(d.expectedClose)) continue;
			events.push({
				id: `${d.path}#close`,
				category: 'deal-close',
				path: d.path,
				date: d.expectedClose,
				title: `Close: ${d.name}`,
				detail: d.stage,
				overdue: d.expectedClose < today,
			});
		}
	}

	return events.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			(a.time ?? '').localeCompare(b.time ?? '') ||
			EVENT_CATEGORIES.indexOf(a.category) - EVENT_CATEGORIES.indexOf(b.category) ||
			a.title.localeCompare(b.title),
	);
}

const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Monday of the week containing `date`. */
export function weekStart(date: DateString): DateString {
	const day = new Date(`${date}T00:00:00Z`).getUTCDay();
	return addDays(date, -((day + 6) % 7));
}

/** The 6 weeks × 7 days shown for the month containing `date`, Monday first. */
export function monthGrid(date: DateString): DateString[] {
	const start = weekStart(`${date.slice(0, 7)}-01`);
	return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export interface PlacedEvent {
	event: CalendarEvent;
	/** Start and end in minutes since midnight. */
	start: number;
	end: number;
	/** Side-by-side column among overlapping events, and how many columns the group has. */
	lane: number;
	lanes: number;
}

/**
 * Lays out one day's timed events so overlapping ones sit side by side.
 * Events are grouped into clusters of transitive overlap; each cluster gets
 * as many lanes as it needs.
 */
export function layoutDay(events: readonly CalendarEvent[]): PlacedEvent[] {
	const timed = events
		.filter((e) => e.time)
		.map((event) => {
			const start = minutes(event.time!);
			return { event, start, end: Math.min(24 * 60, start + (event.duration ?? DEFAULT_DURATION)), lane: 0, lanes: 1 };
		})
		.sort((a, b) => a.start - b.start || b.end - a.end);

	const placed: PlacedEvent[] = [];
	let cluster: PlacedEvent[] = [];
	let laneEnds: number[] = [];
	let clusterEnd = -1;
	const close = () => {
		for (const p of cluster) p.lanes = laneEnds.length;
		placed.push(...cluster);
		cluster = [];
		laneEnds = [];
	};
	for (const p of timed) {
		if (p.start >= clusterEnd) close();
		let lane = laneEnds.findIndex((end) => end <= p.start);
		if (lane === -1) lane = laneEnds.push(0) - 1;
		laneEnds[lane] = p.end;
		p.lane = lane;
		cluster.push(p);
		clusterEnd = Math.max(clusterEnd, p.end);
	}
	close();
	return placed;
}
