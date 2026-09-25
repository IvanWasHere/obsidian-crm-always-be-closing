import { describe, expect, it } from 'vitest';
import type CrmPlugin from '../src/main';
import { findLegacyNotes, migrateDealsToProjects } from '../src/obsidian/migrate';
import { mergeSettings } from '../src/settings';
import { setup } from './fixtures';

/** Notes as the plugin wrote them before deals became projects. */
const LEGACY = {
	'CRM/Companies/Acme Inc.md': { type: 'crm-company' },
	'CRM/Deals/Acme - Pilot.md': { type: 'crm-deal', name: 'Acme – Pilot', company: '[[Acme Inc]]', stage: 'proposal' },
	'Elsewhere/Side deal.md': { type: 'crm-deal', stage: 'lead' },
	'CRM/Interactions/Call.md': { type: 'crm-interaction', kind: 'call', deal: '[[Acme - Pilot]]' },
	'CRM/Invoices/INV.md': { type: 'crm-invoice', number: 'INV-1', deal: '[[Acme - Pilot]]' },
	'Notes/Unrelated.md': { deal: 'not a CRM note' },
};

describe('settings from before projects', () => {
	it('remembers the old deals folder and keeps a custom one as the projects folder', () => {
		expect(mergeSettings({ schemaVersion: 1, folders: { deals: 'CRM/Deals' } })).toMatchObject({
			schemaVersion: 1,
			legacyDealsFolder: 'CRM/Deals',
			folders: { projects: 'CRM/Projects' },
		});
		expect(mergeSettings({ schemaVersion: 1, folders: { deals: 'Work/Deals' } }).folders.projects).toBe('Work/Deals');
		expect(mergeSettings(null)).not.toHaveProperty('legacyDealsFolder');
	});
});

describe('legacy notes', () => {
	it('are still indexed as projects, with deal: links resolved', () => {
		const { index } = setup(LEGACY);
		const crm = index.getSnapshot();
		expect(crm.all('project').map((p) => p.name)).toEqual(['Acme – Pilot', 'Side deal']);
		expect(crm.projectOf('CRM/Interactions/Call.md')?.name).toBe('Acme – Pilot');
		expect(crm.invoicesOf('CRM/Deals/Acme - Pilot.md')).toHaveLength(1);
	});

	it('are migrated: types, link keys, and notes in the old folder moved', async () => {
		const ctx = setup(LEGACY, { schemaVersion: 1, folders: { deals: 'CRM/Deals' } } as never);
		const plugin = { app: ctx.app, settings: ctx.settings, saveSettings: async () => {} } as unknown as CrmPlugin;
		expect(findLegacyNotes(plugin).deals).toHaveLength(2);

		const result = await migrateDealsToProjects(plugin);
		expect(result).toEqual({ projects: 2, links: 2, moved: 1 });

		const note = (p: string) => ctx.app.vault.readNote(p)?.frontmatter;
		expect(note('CRM/Deals/Acme - Pilot.md')).toBeUndefined();
		expect(note('CRM/Projects/Acme - Pilot.md')).toMatchObject({ type: 'crm-project', stage: 'proposal' });
		expect(note('Elsewhere/Side deal.md')).toMatchObject({ type: 'crm-project' }); // not in the deals folder: stays put
		expect(note('CRM/Interactions/Call.md')).toEqual({ type: 'crm-interaction', kind: 'call', project: '[[Acme - Pilot]]' });
		expect(note('CRM/Invoices/INV.md')).not.toHaveProperty('deal');
		expect(note('Notes/Unrelated.md')).toEqual({ deal: 'not a CRM note' });
		expect(ctx.settings.schemaVersion).toBe(2);
		expect(ctx.settings.legacyDealsFolder).toBeUndefined();

		ctx.index.flush();
		expect(ctx.index.getSnapshot().projectOf('CRM/Interactions/Call.md')?.path).toBe('CRM/Projects/Acme - Pilot.md');
		expect(findLegacyNotes(plugin)).toEqual({ deals: [], dealLinks: [] });
	});
});
