import { describe, expect, it } from 'vitest';
import { setup } from './fixtures';

const JANE = 'CRM/Contacts/Jane Doe.md';
const MARIA = 'CRM/Contacts/Maria Garcia.md';
const ACME = 'CRM/Companies/Acme Inc.md';
const PILOT = 'CRM/Deals/Acme - Pilot.md';

describe('CrmRepository', () => {
	it('creates a contact with a link to its company', async () => {
		const { app, repo, index } = setup();
		const file = await repo.createContact({ name: 'Ann Lee', email: 'ann@acme.com', company: ACME, body: 'Met at expo' });

		expect(file.path).toBe('CRM/Contacts/Ann Lee.md');
		expect(app.vault.readNote(file.path)).toMatchObject({
			frontmatter: { type: 'crm-contact', name: 'Ann Lee', email: 'ann@acme.com', company: '[[Acme Inc]]', status: 'active' },
			body: 'Met at expo',
		});
		index.flush();
		expect(index.getSnapshot().companyOf(file.path)?.path).toBe(ACME);
	});

	it('creates the folder and avoids name clashes', async () => {
		const { app, repo, settings } = setup({});
		settings.folders.companies = 'Clients';
		const a = await repo.createCompany({ name: 'Acme Inc' });
		const b = await repo.createCompany({ name: 'Acme Inc' });
		const c = await repo.createCompany({ name: 'Foo/Bar: "Baz"?' });
		expect(app.vault.folders.has('Clients')).toBe(true);
		expect([a.path, b.path, c.path]).toEqual(['Clients/Acme Inc.md', 'Clients/Acme Inc 2.md', 'Clients/Foo Bar Baz.md']);
	});

	it('creates a deal with defaults from settings', async () => {
		const { app, repo } = setup();
		const file = await repo.createDeal({ name: 'Acme – Expansion', company: ACME, contacts: [JANE], value: 5000 });
		expect(app.vault.readNote(file.path)?.frontmatter).toEqual({
			type: 'crm-deal',
			name: 'Acme – Expansion',
			company: '[[Acme Inc]]',
			contacts: ['[[Jane Doe]]'],
			stage: 'lead',
			value: 5000,
			currency: 'EUR',
		});
	});

	it('logs an interaction and moves last_contacted forward only', async () => {
		const { app, repo, index } = setup();
		const file = await repo.logInteraction({
			kind: 'meeting',
			date: '2026-09-15',
			contacts: [JANE, MARIA],
			deal: PILOT,
			summary: 'Pilot kickoff',
		});

		expect(file.path).toBe('CRM/Interactions/2026-09-15 Meeting with Jane Doe and Maria Garcia.md');
		expect(app.vault.readNote(file.path)?.frontmatter).toEqual({
			type: 'crm-interaction',
			kind: 'meeting',
			date: '2026-09-15',
			contacts: ['[[Jane Doe]]', '[[Maria Garcia]]'],
			deal: '[[Acme - Pilot]]',
			summary: 'Pilot kickoff',
		});
		// Jane was last contacted 2026-09-20, which is later; Maria on 2026-09-10.
		expect(app.vault.readNote(JANE)?.frontmatter?.last_contacted).toBe('2026-09-20');
		expect(app.vault.readNote(MARIA)?.frontmatter?.last_contacted).toBe('2026-09-15');

		index.flush();
		expect(index.getSnapshot().interactionsOf(PILOT)).toHaveLength(3);
	});

	it('does not touch last_contacted for notes', async () => {
		const { app, repo } = setup();
		await repo.logInteraction({ kind: 'note', date: '2026-09-30', contacts: [MARIA] });
		expect(app.vault.readNote(MARIA)?.frontmatter?.last_contacted).toBe('2026-09-10');
	});

	it('updates and removes fields', async () => {
		const { app, repo } = setup();
		await repo.updateFields(JANE, { role: 'COO', next_follow_up: null });
		await repo.moveDealStage(PILOT, 'negotiation');
		expect(app.vault.readNote(JANE)?.frontmatter).toMatchObject({ role: 'COO' });
		expect(app.vault.readNote(JANE)?.frontmatter).not.toHaveProperty('next_follow_up');
		expect(app.vault.readNote(PILOT)?.frontmatter?.stage).toBe('negotiation');
		await expect(repo.updateFields('nope.md', {})).rejects.toThrow('Note not found');
	});
});
