import type { CrmSettings } from '../settings';
import { CONTACT_STATUSES, INTERACTION_KINDS, type EntityType } from './types';

export type FieldKind = 'text' | 'email' | 'tel' | 'url' | 'date' | 'number' | 'select' | 'link' | 'links' | 'tags';

/**
 * One editable frontmatter field. Forms, the entity panel and
 * CrmRepository.createEntity all work from these definitions.
 */
export interface FieldSpec {
	/** Frontmatter key, e.g. `next_follow_up`. */
	key: string;
	/** Matching property on the parsed entity, e.g. `nextFollowUp`. */
	prop: string;
	label: string;
	kind: FieldKind;
	/** Entity type a `link`/`links` field points to. */
	target?: EntityType;
	/** Choices for a `select` field. */
	options?: (settings: CrmSettings) => readonly string[];
	required?: boolean;
	placeholder?: string;
}

const f = (key: string, label: string, kind: FieldKind, extra: Partial<FieldSpec> = {}): FieldSpec => ({
	key,
	prop: key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
	label,
	kind,
	...extra,
});

/** Fields per entity type, in the order they're written to frontmatter and shown. */
export const FIELDS: Record<EntityType, FieldSpec[]> = {
	contact: [
		f('name', 'Name', 'text', { required: true }),
		f('company', 'Company', 'link', { target: 'company' }),
		f('role', 'Role', 'text'),
		f('email', 'Email', 'email'),
		f('phone', 'Phone', 'tel'),
		f('status', 'Status', 'select', { options: () => CONTACT_STATUSES }),
		f('last_contacted', 'Last contacted', 'date'),
		f('next_follow_up', 'Next follow-up', 'date'),
		f('tags', 'Tags', 'tags', { placeholder: 'lead, conference' }),
	],
	company: [
		f('name', 'Name', 'text', { required: true }),
		f('domain', 'Domain', 'text', { placeholder: 'example.com' }),
		f('industry', 'Industry', 'text'),
		f('size', 'Size', 'text', { placeholder: '50-200' }),
		f('tags', 'Tags', 'tags'),
	],
	deal: [
		f('name', 'Name', 'text', { required: true }),
		f('company', 'Company', 'link', { target: 'company' }),
		f('contacts', 'Contacts', 'links', { target: 'contact' }),
		f('stage', 'Stage', 'select', { options: (s) => s.pipelineStages }),
		f('value', 'Value', 'number'),
		f('currency', 'Currency', 'text'),
		f('expected_close', 'Expected close', 'date'),
		f('probability', 'Probability', 'number', { placeholder: '0–1' }),
	],
	interaction: [
		f('kind', 'Kind', 'select', { options: () => INTERACTION_KINDS }),
		f('date', 'Date', 'date'),
		f('contacts', 'Contacts', 'links', { target: 'contact' }),
		f('deal', 'Deal', 'link', { target: 'deal' }),
		f('summary', 'Summary', 'text'),
	],
};

export function fieldSpec(type: EntityType, key: string): FieldSpec | undefined {
	return FIELDS[type].find((s) => s.key === key);
}

/**
 * A field value as edited in the UI: text for scalar fields, vault paths
 * for `link`/`links`, strings for `tags`. Empty means "remove".
 */
export type FieldValue = string | string[];

export type FieldValues = Record<string, FieldValue | undefined>;

export function isEmptyValue(value: FieldValue | undefined): boolean {
	return value === undefined || (Array.isArray(value) ? value.length === 0 : value.trim() === '');
}
