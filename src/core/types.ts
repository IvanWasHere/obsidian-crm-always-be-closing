/**
 * Entity types parsed from CRM note frontmatter.
 * Field names are camelCase here; the frontmatter keys they come from are
 * snake_case (see FIELD keys in schema.ts and templates.ts).
 */

export type EntityType = 'contact' | 'company' | 'deal' | 'interaction' | 'quote' | 'invoice';

export const ENTITY_TYPES: readonly EntityType[] = ['contact', 'company', 'deal', 'interaction', 'quote', 'invoice'];

/** Value of the `type` frontmatter field for each entity type. */
export const TYPE_TAGS: Record<EntityType, string> = {
	contact: 'crm-contact',
	company: 'crm-company',
	deal: 'crm-deal',
	interaction: 'crm-interaction',
	quote: 'crm-quote',
	invoice: 'crm-invoice',
};

export const CONTACT_STATUSES = ['active', 'cold', 'archived'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const INTERACTION_KINDS = ['call', 'email', 'meeting', 'note', 'message'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** A calendar date as `YYYY-MM-DD`. Sorts correctly as a string. */
export type DateString = string;

/** A wikilink from frontmatter, e.g. `"[[Acme Inc|Acme]]"`. */
export interface Wikilink {
	/** Link target without brackets, alias or subpath: `Acme Inc`. */
	linkpath: string;
	/** Display text after `|`, if any. */
	alias?: string;
}

interface EntityBase {
	/** Vault path of the note; the entity's id. */
	path: string;
	/** `name` from frontmatter, or the file's basename. */
	name: string;
	tags: string[];
	/** Human-readable problems found while parsing. The entity is still usable. */
	issues: string[];
	/** The note's raw frontmatter, used for custom fields. */
	frontmatter: Readonly<Record<string, unknown>>;
	/** `created` from frontmatter, or the file's creation date. */
	created?: DateString;
}

export interface Contact extends EntityBase {
	type: 'contact';
	email?: string;
	phone?: string;
	company?: Wikilink;
	role?: string;
	status: ContactStatus;
	lastContacted?: DateString;
	nextFollowUp?: DateString;
}

export interface Company extends EntityBase {
	type: 'company';
	domain?: string;
	industry?: string;
	size?: string;
	/** May span several lines. */
	address?: string;
	taxId?: string;
}

export interface Deal extends EntityBase {
	type: 'deal';
	company?: Wikilink;
	contacts: Wikilink[];
	stage: string;
	value?: number;
	currency?: string;
	expectedClose?: DateString;
	/** 0–1 */
	probability?: number;
	/** Stage changes, oldest first. May be empty for deals created before tracking. */
	stageHistory: StageChange[];
}

export interface StageChange {
	date: DateString;
	stage: string;
}

export interface Interaction extends EntityBase {
	type: 'interaction';
	kind: InteractionKind;
	date?: DateString;
	contacts: Wikilink[];
	deal?: Wikilink;
	summary?: string;
}

/** One row of a quote or invoice. `tax` is a percentage. */
export interface LineItem {
	description: string;
	qty: number;
	price: number;
	tax: number;
}

export interface Totals {
	net: number;
	tax: number;
	gross: number;
}

interface BillingBase extends EntityBase {
	number?: string;
	company?: Wikilink;
	contact?: Wikilink;
	deal?: Wikilink;
	/** Date the document was sent (or is dated). */
	issued?: DateString;
	currency?: string;
	items: LineItem[];
	/** Calculated from `items` (or a `total` field when there are none). */
	totals: Totals;
}

export interface Quote extends BillingBase {
	type: 'quote';
	status: QuoteStatus;
	validUntil?: DateString;
}

export interface Invoice extends BillingBase {
	type: 'invoice';
	status: InvoiceStatus;
	due?: DateString;
	paidOn?: DateString;
	quote?: Wikilink;
}

export type Entity = Contact | Company | Deal | Interaction | Quote | Invoice;

export type EntityOfType<T extends EntityType> = Extract<Entity, { type: T }>;
