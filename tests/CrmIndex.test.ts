import { afterEach, describe, expect, it, vi } from 'vitest';
import { classify } from '../src/core/CrmIndex';
import { DEFAULT_SETTINGS } from '../src/settings';
import { setup } from './fixtures';

const JANE = 'CRM/Contacts/Jane Doe.md';
const MARIA = 'CRM/Contacts/Maria Garcia.md';
const ACME = 'CRM/Companies/Acme Inc.md';
const PILOT = 'CRM/Deals/Acme - Pilot.md';

const names = (list: readonly { name: string }[]) => list.map((e) => e.name);

describe('classify', () => {
	it('uses the type field, then the folder', () => {
		expect(classify('Anywhere/x.md', { type: 'crm-deal' }, DEFAULT_SETTINGS)).toBe('deal');
		expect(classify('CRM/Contacts/x.md', undefined, DEFAULT_SETTINGS)).toBe('contact');
		expect(classify('CRM/Contacts/x.md', { type: 'daily' }, DEFAULT_SETTINGS)).toBeNull();
		expect(classify('CRM/Contacts/photo.png', undefined, DEFAULT_SETTINGS)).toBeNull();
		expect(classify('Notes/x.md', {}, DEFAULT_SETTINGS)).toBeNull();
	});
});

describe('CrmIndex', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('indexes the seed notes', () => {
		const { index } = setup();
		const crm = index.getSnapshot();
		expect(crm.count('contact')).toBe(3);
		expect(crm.count('company')).toBe(2);
		expect(crm.count('deal')).toBe(2);
		expect(crm.count('interaction')).toBe(2);
		expect(names(crm.all('contact'))).toEqual(['Jane Doe', 'John Smith', 'Maria Garcia']);
		expect(crm.all('interaction').map((i) => i.date)).toEqual(['2026-09-20', '2026-09-10']);
	});

	it('ignores notes outside CRM folders without a crm type', () => {
		const { index } = setup({ 'Daily/2026-09-25.md': { mood: 'good' }, 'Inbox/Lead.md': { type: 'crm-contact' } });
		expect(names(index.getSnapshot().all('contact'))).toEqual(['Lead']);
		expect(index.getSnapshot().entities.size).toBe(1);
	});

	it('resolves relations in both directions', () => {
		const crm = setup().index.getSnapshot();
		expect(crm.companyOf(JANE)?.name).toBe('Acme Inc');
		expect(names(crm.contactsOf(ACME))).toEqual(['Jane Doe', 'Maria Garcia']);
		expect(names(crm.contactsOf(PILOT))).toEqual(['Jane Doe', 'Maria Garcia']);
		expect(names(crm.dealsOf(ACME))).toEqual(['Acme – Pilot']);
		expect(names(crm.dealsOf(JANE))).toEqual(['Acme – Pilot']);
		expect(crm.interactionsOf(JANE).map((i) => i.date)).toEqual(['2026-09-20']);
		expect(crm.interactionsOf(PILOT).map((i) => i.date)).toEqual(['2026-09-20', '2026-09-10']);
		expect(crm.interactionsOf(ACME).map((i) => i.date)).toEqual(['2026-09-20', '2026-09-10']);
		expect(crm.dealOf('CRM/Interactions/2026-09-20 Call with Jane Doe.md')?.name).toBe('Acme – Pilot');
	});

	it('ignores links to missing notes or notes of the wrong type', () => {
		const { index } = setup({
			'CRM/Contacts/A.md': { company: '[[Nowhere]]' },
			'CRM/Contacts/B.md': { company: '[[A]]' },
		});
		const crm = index.getSnapshot();
		expect(crm.companyOf('CRM/Contacts/A.md')).toBeUndefined();
		expect(crm.companyOf('CRM/Contacts/B.md')).toBeUndefined();
		expect(crm.get('CRM/Contacts/A.md', 'contact')?.company).toEqual({ linkpath: 'Nowhere' });
	});

	it('batches changes and publishes a new snapshot after the debounce', () => {
		vi.useFakeTimers();
		const { app, index } = setup();
		const before = index.getSnapshot();
		const listener = vi.fn();
		index.subscribe(listener);

		app.vault.addNote('CRM/Contacts/Zoe.md', { type: 'crm-contact', company: '[[Globex]]' });
		app.vault.setFrontmatter(JANE, { type: 'crm-contact', name: 'Jane Doe', status: 'cold' });
		expect(index.getSnapshot()).toBe(before);

		vi.advanceTimersByTime(200);
		expect(listener).toHaveBeenCalledTimes(1);
		const after = index.getSnapshot();
		expect(after).not.toBe(before);
		expect(after.version).toBe(before.version + 1);
		expect(after.get(JANE, 'contact')?.status).toBe('cold');
		expect(after.get(JANE, 'contact')?.company).toBeUndefined();
		expect(names(after.contactsOf('CRM/Companies/Globex.md'))).toEqual(['John Smith', 'Zoe']);
	});

	it('does not publish for unrelated notes', () => {
		const { app, index } = setup();
		const listener = vi.fn();
		index.subscribe(listener);
		app.vault.addNote('Daily/2026-09-25.md', {});
		index.flush();
		expect(listener).not.toHaveBeenCalled();
	});

	it('handles deletes and renames', () => {
		const { app, index } = setup();
		app.vault.deleteNote(MARIA);
		index.flush();
		expect(names(index.getSnapshot().contactsOf(ACME))).toEqual(['Jane Doe']);

		app.vault.renameNote(ACME, 'CRM/Companies/Acme Corp.md');
		index.flush();
		const crm = index.getSnapshot();
		expect(crm.get(ACME)).toBeUndefined();
		expect(crm.get('CRM/Companies/Acme Corp.md')?.name).toBe('Acme Inc');
		// Links still say [[Acme Inc]]; Obsidian would rewrite them on rename.
		expect(crm.companyOf(JANE)).toBeUndefined();
	});

	it('picks up notes that start or stop being CRM entities', () => {
		const { app, index } = setup({ 'Notes/Someone.md': {} });
		expect(index.getSnapshot().entities.size).toBe(0);
		app.vault.setFrontmatter('Notes/Someone.md', { type: 'crm-contact' });
		index.flush();
		expect(index.getSnapshot().count('contact')).toBe(1);
		app.vault.setFrontmatter('Notes/Someone.md', {});
		index.flush();
		expect(index.getSnapshot().count('contact')).toBe(0);
	});

	it('rescans when settings change', () => {
		const { index, settings } = setup({ 'People/Ann.md': {} });
		expect(index.getSnapshot().count('contact')).toBe(0);
		settings.folders.contacts = 'People';
		index.requestRescan();
		index.flush();
		expect(index.getSnapshot().count('contact')).toBe(1);
	});

	it('stops listening after unload', () => {
		const { app, index } = setup();
		index.unload();
		app.vault.addNote('CRM/Contacts/Late.md', {});
		index.flush();
		expect(index.getSnapshot().count('contact')).toBe(3);
	});
});
