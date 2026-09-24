import type { CrmSettings } from '../settings';
import type { CrmSnapshot } from './CrmSnapshot';
import type { CrmRepository } from './CrmRepository';
import { fieldsFor, type FieldValues } from './fields';
import { CONTACT_STATUSES } from './types';

/** CSV columns → contact fields. Each target maps to a column index, or -1 for none. */
export type Mapping = Record<string, number>;

export interface ImportTarget {
	key: string;
	label: string;
}

/**
 * Contact fields a CSV column can fill. `first_name`/`last_name` are combined
 * into `name` when there's no full-name column; `notes` becomes the note body.
 */
export function importTargets(settings: CrmSettings): ImportTarget[] {
	const fields = fieldsFor('contact', settings)
		.filter((s) => s.key !== 'company')
		.map((s) => ({ key: s.key, label: s.label }));
	return [
		fields[0]!, // name
		{ key: 'first_name', label: 'First name' },
		{ key: 'last_name', label: 'Last name' },
		{ key: 'company', label: 'Company' },
		...fields.slice(1),
		{ key: 'notes', label: 'Notes (note body)' },
	];
}

/** Header names that auto-map to a target (compared lowercased). Covers LinkedIn and Google Contacts exports. */
const SYNONYMS: Record<string, string[]> = {
	name: ['name', 'full name', 'display name', 'contact name'],
	first_name: ['first name', 'given name', 'firstname'],
	last_name: ['last name', 'family name', 'surname', 'lastname'],
	company: ['company', 'company name', 'organization', 'organization name', 'organization 1 - name', 'organisation'],
	role: ['role', 'position', 'title', 'job title', 'organization title', 'organization 1 - title'],
	email: ['email', 'e-mail', 'email address', 'e-mail address', 'e-mail 1 - value', 'primary email'],
	phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'phone 1 - value', 'primary phone'],
	tags: ['tags', 'labels', 'group membership'],
	status: ['status'],
	last_contacted: ['last contacted', 'last_contacted'],
	next_follow_up: ['next follow-up', 'next follow up', 'next_follow_up', 'follow up'],
	notes: ['notes', 'note', 'description'],
};

export interface CsvTable {
	headers: string[];
	rows: string[][];
}

/**
 * Splits parsed CSV rows into headers and data. LinkedIn exports start with
 * a few lines of notes, so the header is the first row (of the first 10)
 * where at least two cells look like known column names.
 */
export function toTable(rows: string[][]): CsvTable {
	const known = new Set(Object.values(SYNONYMS).flat());
	const limit = Math.min(rows.length, 10);
	let headerIndex = 0;
	for (let i = 0; i < limit; i++) {
		if (rows[i]!.filter((c) => known.has(c.trim().toLowerCase())).length >= 2) {
			headerIndex = i;
			break;
		}
	}
	const headers = (rows[headerIndex] ?? []).map((h) => h.trim());
	return { headers, rows: rows.slice(headerIndex + 1) };
}

/** Guesses a mapping from header names, using synonyms and custom-field labels/keys. */
export function autoMap(headers: string[], targets: ImportTarget[]): Mapping {
	const lower = headers.map((h) => h.toLowerCase());
	const mapping: Mapping = {};
	for (const target of targets) {
		const names = SYNONYMS[target.key] ?? [target.key.toLowerCase(), target.label.toLowerCase()];
		mapping[target.key] = lower.findIndex((h) => names.includes(h));
	}
	return mapping;
}

export interface ImportContact {
	name: string;
	/** Field values; `company` is a company name here, resolved at import time. */
	values: FieldValues;
	companyName?: string;
	body: string;
}

export interface ImportPlan {
	contacts: ImportContact[];
	/** Rows skipped because a contact with the same email or name already exists (or appears earlier in the file). */
	duplicates: number;
	/** Rows skipped because they have no name. */
	unnamed: number;
	/** Company names that don't match an existing company (case-insensitive). */
	newCompanies: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Turns CSV rows into contacts to create, skipping duplicates and rows without a name. */
export function planImport(table: CsvTable, mapping: Mapping, crm: CrmSnapshot): ImportPlan {
	const get = (row: string[], key: string) => {
		const i = mapping[key] ?? -1;
		return i >= 0 ? (row[i] ?? '').trim() : '';
	};

	const seenEmails = new Set(crm.all('contact').flatMap((c) => (c.email ? [c.email.toLowerCase()] : [])));
	const seenNames = new Set(crm.all('contact').map((c) => c.name.toLowerCase()));
	const companies = new Map(crm.all('company').map((c) => [c.name.toLowerCase(), c.name]));
	const newCompanies = new Map<string, string>();

	const plan: ImportPlan = { contacts: [], duplicates: 0, unnamed: 0, newCompanies: [] };

	for (const row of table.rows) {
		const name = get(row, 'name') || [get(row, 'first_name'), get(row, 'last_name')].filter(Boolean).join(' ');
		if (!name) {
			plan.unnamed++;
			continue;
		}
		const email = get(row, 'email');
		if ((email && seenEmails.has(email.toLowerCase())) || seenNames.has(name.toLowerCase())) {
			plan.duplicates++;
			continue;
		}
		if (email) seenEmails.add(email.toLowerCase());
		seenNames.add(name.toLowerCase());

		const values: FieldValues = {};
		for (const key of Object.keys(mapping)) {
			if (['name', 'first_name', 'last_name', 'company', 'notes'].includes(key)) continue;
			const value = get(row, key);
			if (!value) continue;
			if (key === 'status' && !(CONTACT_STATUSES as readonly string[]).includes(value.toLowerCase())) continue;
			if ((key === 'last_contacted' || key === 'next_follow_up') && !DATE.test(value)) continue;
			// Google Contacts labels look like "* myContacts ::: Friends".
			values[key] = key === 'tags' ? splitTags(value) : key === 'status' ? value.toLowerCase() : value;
		}
		values.name = name;

		const company = get(row, 'company');
		if (company && !companies.has(company.toLowerCase()) && !newCompanies.has(company.toLowerCase())) {
			newCompanies.set(company.toLowerCase(), company);
		}
		plan.contacts.push({ name, values, companyName: company || undefined, body: get(row, 'notes') });
	}
	plan.newCompanies = [...newCompanies.values()];
	return plan;
}

function splitTags(value: string): string[] {
	return value
		.split(/:::|[,;]/)
		.map((t) => t.replace(/^\*/, '').trim().replace(/\s+/g, '-'))
		.filter((t) => t && t.toLowerCase() !== 'mycontacts');
}

export interface ImportResult {
	contacts: number;
	companies: number;
	failed: { name: string; error: string }[];
}

/**
 * Creates the planned notes. Companies are created first (if `createCompanies`)
 * so contacts can link to them. Otherwise contacts still get a `[[Company]]`
 * link, which Obsidian shows as a note that doesn't exist yet.
 */
export async function runImport(
	plan: ImportPlan,
	crm: CrmSnapshot,
	repo: CrmRepository,
	options: { createCompanies: boolean; onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> {
	const result: ImportResult = { contacts: 0, companies: 0, failed: [] };
	const companyPaths = new Map(crm.all('company').map((c) => [c.name.toLowerCase(), c.path]));

	if (options.createCompanies) {
		for (const name of plan.newCompanies) {
			try {
				const file = await repo.createEntity('company', { name });
				companyPaths.set(name.toLowerCase(), file.path);
				result.companies++;
			} catch (err) {
				result.failed.push({ name, error: err instanceof Error ? err.message : String(err) });
			}
		}
	}

	const total = plan.contacts.length;
	for (const [i, contact] of plan.contacts.entries()) {
		const { companyName } = contact;
		// A name that isn't a vault path is written as a plain [[Name]] link.
		const company = companyName ? (companyPaths.get(companyName.toLowerCase()) ?? companyName) : undefined;
		try {
			await repo.createEntity('contact', { ...contact.values, company: company ? [company] : undefined }, contact.body);
			result.contacts++;
		} catch (err) {
			result.failed.push({ name: contact.name, error: err instanceof Error ? err.message : String(err) });
		}
		options.onProgress?.(i + 1, total);
	}
	return result;
}
