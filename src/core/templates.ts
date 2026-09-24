import type { Frontmatter } from './schema';
import { TYPE_TAGS, type ContactStatus, type DateString, type EntityType, type InteractionKind } from './types';

/**
 * Inputs for new notes. Relations are given as wikilink strings
 * (`[[Acme Inc]]`); CrmRepository converts vault paths to links.
 */
export interface ContactFields {
	name: string;
	email?: string;
	phone?: string;
	company?: string;
	role?: string;
	tags?: string[];
	status?: ContactStatus;
	nextFollowUp?: DateString;
}

export interface CompanyFields {
	name: string;
	domain?: string;
	industry?: string;
	size?: string;
	tags?: string[];
}

export interface DealFields {
	name: string;
	company?: string;
	contacts?: string[];
	stage: string;
	value?: number;
	currency?: string;
	expectedClose?: DateString;
	probability?: number;
}

export interface InteractionFields {
	kind: InteractionKind;
	date: DateString;
	contacts?: string[];
	deal?: string;
	summary?: string;
}

/** Builds frontmatter in a stable, readable key order, leaving out empty values. */
function frontmatter(type: EntityType, fields: [string, unknown][]): Frontmatter {
	const fm: Frontmatter = { type: TYPE_TAGS[type] };
	for (const [key, value] of fields) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		fm[key] = value;
	}
	return fm;
}

export function contactFrontmatter(f: ContactFields): Frontmatter {
	return frontmatter('contact', [
		['name', f.name],
		['email', f.email],
		['phone', f.phone],
		['company', f.company],
		['role', f.role],
		['tags', f.tags],
		['status', f.status ?? 'active'],
		['next_follow_up', f.nextFollowUp],
	]);
}

export function companyFrontmatter(f: CompanyFields): Frontmatter {
	return frontmatter('company', [
		['name', f.name],
		['domain', f.domain],
		['industry', f.industry],
		['size', f.size],
		['tags', f.tags],
	]);
}

export function dealFrontmatter(f: DealFields): Frontmatter {
	return frontmatter('deal', [
		['name', f.name],
		['company', f.company],
		['contacts', f.contacts],
		['stage', f.stage],
		['value', f.value],
		['currency', f.currency],
		['expected_close', f.expectedClose],
		['probability', f.probability],
	]);
}

export function interactionFrontmatter(f: InteractionFields): Frontmatter {
	return frontmatter('interaction', [
		['kind', f.kind],
		['date', f.date],
		['contacts', f.contacts],
		['deal', f.deal],
		['summary', f.summary],
	]);
}

const KIND_TITLES: Record<InteractionKind, string> = {
	call: 'Call with',
	email: 'Email with',
	meeting: 'Meeting with',
	message: 'Message with',
	note: 'Note on',
};

/** e.g. `2026-09-20 Call with Jane Doe`, `2026-09-20 Meeting with Jane Doe +2`. */
export function interactionTitle(kind: InteractionKind, date: DateString, contactNames: string[]): string {
	const [first, ...rest] = contactNames;
	if (!first) return `${date} ${KIND_TITLES[kind].split(' ')[0]!}`;
	const who = rest.length === 0 ? first : rest.length === 1 ? `${first} and ${rest[0]!}` : `${first} +${rest.length}`;
	return `${date} ${KIND_TITLES[kind]} ${who}`;
}

/** Removes characters that are not allowed in file names or break links. */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '');
}
