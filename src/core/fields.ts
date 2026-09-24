import type { CrmSettings } from '../settings';
import { CONTACT_STATUSES, INTERACTION_KINDS, INVOICE_STATUSES, QUOTE_STATUSES, type EntityType } from './types';

export type FieldKind =
	| 'text'
	| 'email'
	| 'tel'
	| 'url'
	| 'date'
	| 'number'
	| 'select'
	| 'checkbox'
	| 'link'
	| 'links'
	| 'tags'
	| 'items'
	| 'multiline';

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
	/** A user-defined field from settings; its value is read from raw frontmatter. */
	custom?: boolean;
	/** Custom fields: show as a column in list views. */
	showInTable?: boolean;
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
		f('address', 'Address', 'multiline'),
		f('tax_id', 'Tax ID', 'text'),
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
	quote: [
		f('number', 'Number', 'text', { required: true }),
		f('status', 'Status', 'select', { options: () => QUOTE_STATUSES, required: true }),
		f('company', 'Company', 'link', { target: 'company' }),
		f('contact', 'Contact', 'link', { target: 'contact' }),
		f('deal', 'Deal', 'link', { target: 'deal' }),
		f('issued', 'Issued', 'date'),
		f('valid_until', 'Valid until', 'date'),
		f('currency', 'Currency', 'text'),
		f('items', 'Line items', 'items'),
	],
	invoice: [
		f('number', 'Number', 'text', { required: true }),
		f('status', 'Status', 'select', { options: () => INVOICE_STATUSES, required: true }),
		f('company', 'Company', 'link', { target: 'company' }),
		f('contact', 'Contact', 'link', { target: 'contact' }),
		f('deal', 'Deal', 'link', { target: 'deal' }),
		f('quote', 'Quote', 'link', { target: 'quote' }),
		f('issued', 'Issued', 'date'),
		f('due', 'Due', 'date'),
		f('paid_on', 'Paid on', 'date'),
		f('currency', 'Currency', 'text'),
		f('items', 'Line items', 'items'),
	],
};

export function fieldSpec(type: EntityType, key: string): FieldSpec | undefined {
	return FIELDS[type].find((s) => s.key === key);
}

// ---------- Custom fields ----------

export const CUSTOM_FIELD_KINDS = ['text', 'number', 'date', 'url', 'email', 'tel', 'select', 'checkbox', 'tags'] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

/** A user-defined frontmatter field, configured in settings. */
export interface CustomField {
	key: string;
	label: string;
	kind: CustomFieldKind;
	/** Choices for `select`. */
	options?: string[];
	showInTable?: boolean;
}

/** `LinkedIn URL` → `linkedin_url` */
export function slugifyKey(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** Why a custom field can't be used, or null if it's fine. */
export function customFieldProblem(type: EntityType, field: CustomField, all: CustomField[]): string | null {
	if (!field.key) return 'Needs a key.';
	if (!/^[a-z][a-z0-9_-]*$/.test(field.key)) return 'Key must start with a letter and use only a-z, 0-9, _ or -.';
	if (field.key === 'type' || fieldSpec(type, field.key)) return `"${field.key}" is a built-in field.`;
	if (all.filter((f) => f.key === field.key).length > 1) return `Key "${field.key}" is used twice.`;
	return null;
}

/** Built-in fields followed by the valid custom fields for an entity type. */
export function fieldsFor(type: EntityType, settings: CrmSettings): FieldSpec[] {
	const custom = settings.customFields[type] ?? [];
	return [
		...FIELDS[type],
		...custom
			.filter((f) => customFieldProblem(type, f, custom) === null)
			.map(
				(f): FieldSpec => ({
					key: f.key,
					prop: f.key,
					label: f.label || f.key,
					kind: f.kind,
					options: f.kind === 'select' ? () => f.options ?? [] : undefined,
					custom: true,
					showInTable: f.showInTable,
				}),
			),
	];
}

/** A line item as edited in the UI: every cell is text until saved. */
export interface LineItemInput {
	description: string;
	qty: string;
	price: string;
	tax: string;
}

/**
 * A field value as edited in the UI: text for scalar fields, vault paths
 * for `link`/`links`, line items for `items`. Empty means "remove".
 */
export type FieldValue = string | string[] | LineItemInput[];

export type FieldValues = Record<string, FieldValue | undefined>;

export function isEmptyValue(value: FieldValue | undefined): boolean {
	return value === undefined || (Array.isArray(value) ? value.length === 0 : value.trim() === '');
}
