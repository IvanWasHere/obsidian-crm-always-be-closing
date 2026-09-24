import type { App as ObsidianApp } from 'obsidian';
import { App } from './mocks/obsidian';
import { CrmIndex } from '../src/core/CrmIndex';
import { CrmRepository } from '../src/core/CrmRepository';
import { mergeSettings, type CrmSettings } from '../src/settings';

/** Same notes as test-vault/CRM. */
export const SEED: Record<string, Record<string, unknown>> = {
	'CRM/Companies/Acme Inc.md': { type: 'crm-company', name: 'Acme Inc', domain: 'acme.com', tags: ['customer'] },
	'CRM/Companies/Globex.md': { type: 'crm-company', name: 'Globex', tags: ['prospect'] },
	'CRM/Contacts/Jane Doe.md': {
		type: 'crm-contact',
		name: 'Jane Doe',
		company: '[[Acme Inc]]',
		status: 'active',
		last_contacted: '2026-09-20',
		next_follow_up: '2026-10-01',
	},
	'CRM/Contacts/John Smith.md': { type: 'crm-contact', name: 'John Smith', company: '[[Globex]]', status: 'cold' },
	'CRM/Contacts/Maria Garcia.md': {
		type: 'crm-contact',
		name: 'Maria Garcia',
		company: '[[Acme Inc]]',
		last_contacted: '2026-09-10',
	},
	'CRM/Deals/Acme - Pilot.md': {
		type: 'crm-deal',
		name: 'Acme – Pilot',
		company: '[[Acme Inc]]',
		contacts: ['[[Jane Doe]]', '[[Maria Garcia]]'],
		stage: 'proposal',
		value: 12000,
		currency: 'EUR',
	},
	'CRM/Deals/Globex - Discovery.md': {
		type: 'crm-deal',
		name: 'Globex – Discovery',
		company: '[[Globex]]',
		contacts: ['[[John Smith]]'],
		stage: 'lead',
	},
	'CRM/Interactions/2026-09-10 Email to Maria Garcia.md': {
		type: 'crm-interaction',
		kind: 'email',
		date: '2026-09-10',
		contacts: ['[[Maria Garcia]]'],
		deal: '[[Acme - Pilot]]',
	},
	'CRM/Interactions/2026-09-20 Call with Jane Doe.md': {
		type: 'crm-interaction',
		kind: 'call',
		date: '2026-09-20',
		contacts: ['[[Jane Doe]]'],
		deal: '[[Acme - Pilot]]',
	},
};

export function setup(notes: Record<string, Record<string, unknown> | undefined> = SEED, saved?: Partial<CrmSettings>) {
	const app = new App();
	for (const [path, fm] of Object.entries(notes)) app.vault.addNote(path, fm);
	const settings = mergeSettings(saved);
	const obsidianApp = app as unknown as ObsidianApp;
	const index = new CrmIndex(obsidianApp, () => settings);
	const repo = new CrmRepository(obsidianApp, () => settings);
	index.load();
	return { app, settings, index, repo };
}
