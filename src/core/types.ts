/**
 * Entity types parsed from CRM note frontmatter.
 * Field names are camelCase here; the frontmatter keys they come from are
 * snake_case (see FIELD keys in schema.ts and templates.ts).
 */

export type EntityType = 'contact' | 'company' | 'deal' | 'interaction';

export const ENTITY_TYPES: readonly EntityType[] = ['contact', 'company', 'deal', 'interaction'];

/** Value of the `type` frontmatter field for each entity type. */
export const TYPE_TAGS: Record<EntityType, string> = {
	contact: 'crm-contact',
	company: 'crm-company',
	deal: 'crm-deal',
	interaction: 'crm-interaction',
};

export const CONTACT_STATUSES = ['active', 'cold', 'archived'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const INTERACTION_KINDS = ['call', 'email', 'meeting', 'note', 'message'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

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
}

export interface Interaction extends EntityBase {
	type: 'interaction';
	kind: InteractionKind;
	date?: DateString;
	contacts: Wikilink[];
	deal?: Wikilink;
	summary?: string;
}

export type Entity = Contact | Company | Deal | Interaction;

export type EntityOfType<T extends EntityType> = Extract<Entity, { type: T }>;
