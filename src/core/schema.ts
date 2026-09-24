import { parseLineItems, parseStageHistory, totalsOf } from './billing';
import {
	CONTACT_STATUSES,
	INTERACTION_KINDS,
	INVOICE_STATUSES,
	QUOTE_STATUSES,
	TYPE_TAGS,
	type Company,
	type Contact,
	type ContactStatus,
	type DateString,
	type Deal,
	type Entity,
	type EntityType,
	type Interaction,
	type InteractionKind,
	type Invoice,
	type InvoiceStatus,
	type Quote,
	type QuoteStatus,
	type Wikilink,
} from './types';

export type Frontmatter = Record<string, unknown>;

export interface ParseOptions {
	/** Known pipeline stages. Deals in other stages get an issue. */
	stages: readonly string[];
}

/** Maps a `type` frontmatter value like `crm-contact` to an entity type. */
export function typeFromTag(value: unknown): EntityType | null {
	for (const [type, tag] of Object.entries(TYPE_TAGS)) {
		if (value === tag) return type as EntityType;
	}
	return null;
}

export function basename(path: string): string {
	return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/**
 * Parses `[[Target]]`, `[[Target|Alias]]` or `[[Target#Heading]]`.
 * A bare string without brackets is also accepted as a link target.
 * Handles the unquoted YAML mistake `company: [[Acme]]`, which parses as `[["Acme"]]`.
 */
export function parseWikilink(value: unknown): Wikilink | undefined {
	if (Array.isArray(value) && value.length === 1 && Array.isArray(value[0]) && value[0].length === 1) {
		value = value[0][0];
	}
	if (typeof value !== 'string') return undefined;
	let text = value.trim();
	const match = /^\[\[(.*)\]\]$/.exec(text);
	if (match) text = match[1] ?? '';
	const [target = '', alias] = text.split('|', 2);
	const linkpath = target.split('#', 1)[0]!.trim();
	if (!linkpath) return undefined;
	const trimmedAlias = alias?.trim();
	return trimmedAlias ? { linkpath, alias: trimmedAlias } : { linkpath };
}

/** Parses a single link or a list of links. Invalid items are dropped. */
export function parseWikilinks(value: unknown): Wikilink[] {
	if (value === undefined || value === null) return [];
	// `contacts: [[Jane]]` unquoted → [["Jane"]]; `contacts: [[[Jane]], [[John]]]` → [[["Jane"]], [["John"]]]
	const items = Array.isArray(value) ? value : [value];
	return items.flatMap((item) => {
		const link = parseWikilink(Array.isArray(item) && item.length === 1 && typeof item[0] === 'string' ? item[0] : item);
		return link ? [link] : [];
	});
}

/** Formats a local Date as `YYYY-MM-DD`. */
export function formatDate(date: Date): DateString {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Collects typed field values and records an issue for each invalid one.
 */
class FieldReader {
	readonly issues: string[] = [];

	constructor(private fm: Frontmatter) {}

	private has(key: string) {
		const v = this.fm[key];
		return v !== undefined && v !== null && v !== '';
	}

	string(key: string): string | undefined {
		if (!this.has(key)) return undefined;
		const v = this.fm[key];
		if (typeof v === 'string') return v.trim() || undefined;
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		this.issues.push(`${key} should be text`);
		return undefined;
	}

	number(key: string): number | undefined {
		if (!this.has(key)) return undefined;
		const v = this.fm[key];
		const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[\s,_]/g, '')) : NaN;
		if (Number.isFinite(n)) return n;
		this.issues.push(`${key} should be a number`);
		return undefined;
	}

	date(key: string): DateString | undefined {
		if (!this.has(key)) return undefined;
		const v = this.fm[key];
		if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
		if (typeof v === 'string') {
			const m = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(v.trim());
			if (m && !isNaN(Date.parse(m[1]!))) return m[1];
		}
		this.issues.push(`${key} should be a date (YYYY-MM-DD)`);
		return undefined;
	}

	oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
		const v = this.string(key);
		if (v === undefined) return fallback;
		const lower = v.toLowerCase();
		const found = allowed.find((a) => a === lower);
		if (found) return found;
		this.issues.push(`${key} "${v}" should be one of: ${allowed.join(', ')}`);
		return fallback;
	}

	link(key: string): Wikilink | undefined {
		if (!this.has(key)) return undefined;
		const link = parseWikilink(this.fm[key]);
		if (!link) this.issues.push(`${key} should be a link like "[[Name]]"`);
		return link;
	}

	links(key: string): Wikilink[] {
		if (!this.has(key)) return [];
		const raw = this.fm[key];
		const links = parseWikilinks(raw);
		const count = Array.isArray(raw) ? raw.length : 1;
		if (links.length < count) this.issues.push(`${key} has entries that are not links`);
		return links;
	}

	tags(): string[] {
		const v = this.fm.tags;
		const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [];
		return items
			.filter((t): t is string | number => typeof t === 'string' || typeof t === 'number')
			.map((t) => String(t).trim().replace(/^#/, ''))
			.filter(Boolean);
	}
}

/**
 * Parses frontmatter into an entity of the given type. Never throws:
 * invalid fields are dropped and reported in `issues`.
 */
export function parseEntity(
	type: EntityType,
	path: string,
	fm: Frontmatter | undefined,
	options: ParseOptions,
	/** File creation time (ms), used when there's no `created` field. */
	ctime?: number,
): Entity {
	const r = new FieldReader(fm ?? {});
	const base = {
		path,
		name: r.string('name') ?? (type === 'quote' || type === 'invoice' ? r.string('number') : undefined) ?? basename(path),
		tags: r.tags(),
		frontmatter: fm ?? {},
		created: r.date('created') ?? (ctime ? formatDate(new Date(ctime)) : undefined),
	};

	let entity: Entity;
	switch (type) {
		case 'contact':
			entity = {
				...base,
				type,
				email: r.string('email'),
				phone: r.string('phone'),
				company: r.link('company'),
				role: r.string('role'),
				status: r.oneOf<ContactStatus>('status', CONTACT_STATUSES, 'active'),
				lastContacted: r.date('last_contacted'),
				nextFollowUp: r.date('next_follow_up'),
				issues: r.issues,
			} satisfies Contact;
			break;
		case 'company':
			entity = {
				...base,
				type,
				domain: r.string('domain'),
				industry: r.string('industry'),
				size: r.string('size'),
				address: r.string('address'),
				taxId: r.string('tax_id'),
				issues: r.issues,
			} satisfies Company;
			break;
		case 'deal': {
			let stage = r.string('stage');
			if (stage === undefined) {
				stage = options.stages[0] ?? 'lead';
				r.issues.push(`stage is missing; treated as "${stage}"`);
			} else if (options.stages.length > 0 && !options.stages.includes(stage)) {
				r.issues.push(`stage "${stage}" is not in the pipeline stages`);
			}
			let probability = r.number('probability');
			if (probability !== undefined && (probability < 0 || probability > 1)) {
				r.issues.push('probability should be between 0 and 1');
				probability = undefined;
			}
			entity = {
				...base,
				type,
				company: r.link('company'),
				contacts: r.links('contacts'),
				stage,
				value: r.number('value'),
				currency: r.string('currency')?.toUpperCase(),
				expectedClose: r.date('expected_close'),
				probability,
				stageHistory: parseStageHistory(fm?.stage_history),
				issues: r.issues,
			} satisfies Deal;
			break;
		}
		case 'interaction':
			entity = {
				...base,
				type,
				kind: r.oneOf<InteractionKind>('kind', INTERACTION_KINDS, 'note'),
				date: r.date('date'),
				contacts: r.links('contacts'),
				deal: r.link('deal'),
				summary: r.string('summary'),
				issues: r.issues,
			} satisfies Interaction;
			break;
		case 'quote':
		case 'invoice': {
			const { items, invalid } = parseLineItems(fm?.items);
			if (invalid > 0) r.issues.push(`${invalid} line item${invalid === 1 ? ' is' : 's are'} unreadable`);
			const total = r.number('total');
			const totals = items.length === 0 && total !== undefined ? { net: total, tax: 0, gross: total } : totalsOf(items);
			const billing = {
				...base,
				number: r.string('number'),
				company: r.link('company'),
				contact: r.link('contact'),
				deal: r.link('deal'),
				issued: r.date('issued'),
				currency: r.string('currency')?.toUpperCase(),
				items,
				totals,
			};
			entity =
				type === 'quote'
					? ({
							...billing,
							type,
							status: r.oneOf<QuoteStatus>('status', QUOTE_STATUSES, 'draft'),
							validUntil: r.date('valid_until'),
							issues: r.issues,
						} satisfies Quote)
					: ({
							...billing,
							type,
							status: r.oneOf<InvoiceStatus>('status', INVOICE_STATUSES, 'draft'),
							due: r.date('due'),
							paidOn: r.date('paid_on'),
							quote: r.link('quote'),
							issues: r.issues,
						} satisfies Invoice);
			break;
		}
	}
	return stripUndefined(entity);
}

/** Drops keys whose value is undefined so entities compare and print cleanly. */
function stripUndefined<T extends object>(obj: T): T {
	for (const key of Object.keys(obj) as (keyof T)[]) {
		if (obj[key] === undefined) delete obj[key];
	}
	return obj;
}
