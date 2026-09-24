import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldSpec } from '../src/core/fields';
import { setup } from './fixtures';

// New notes get `created: <today>`; pin today so expectations are exact.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});


const JANE = 'CRM/Contacts/Jane Doe.md';
const MARIA = 'CRM/Contacts/Maria Garcia.md';
const ACME = 'CRM/Companies/Acme Inc.md';
const PILOT = 'CRM/Deals/Acme - Pilot.md';

describe('CrmRepository', () => {
	it('creates a contact with a link to its company, in field order', async () => {
		const { app, repo, index } = setup();
		const file = await repo.createEntity(
			'contact',
			{ email: 'ann@acme.com', name: ' Ann Lee ', company: [ACME], tags: 'lead, #expo', phone: '' },
			'Met at expo',
		);

		expect(file.path).toBe('CRM/Contacts/Ann Lee.md');
		const note = app.vault.readNote(file.path)!;
		expect(note.body).toBe('Met at expo');
		expect(Object.entries(note.frontmatter!)).toEqual([
			['type', 'crm-contact'],
			['name', 'Ann Lee'],
			['company', '[[Acme Inc]]'],
			['email', 'ann@acme.com'],
			['status', 'active'],
			['tags', ['lead', 'expo']],
			['created', '2026-09-25'],
		]);
		index.flush();
		expect(index.getSnapshot().companyOf(file.path)?.path).toBe(ACME);
	});

	it('requires a name', async () => {
		const { repo } = setup();
		await expect(repo.createEntity('company', { name: '  ' })).rejects.toThrow('Name is required');
	});

	it('creates the folder and avoids name clashes', async () => {
		const { app, repo, settings } = setup({});
		settings.folders.companies = 'Clients';
		const a = await repo.createEntity('company', { name: 'Acme Inc' });
		const b = await repo.createEntity('company', { name: 'Acme Inc' });
		const c = await repo.createEntity('company', { name: 'Foo/Bar: "Baz"?' });
		expect(app.vault.folders.has('Clients')).toBe(true);
		expect([a.path, b.path, c.path]).toEqual(['Clients/Acme Inc.md', 'Clients/Acme Inc 2.md', 'Clients/Foo Bar Baz.md']);
	});

	it('creates a deal with defaults from settings', async () => {
		const { app, repo } = setup();
		const file = await repo.createEntity('deal', {
			name: 'Acme – Expansion',
			company: [ACME],
			contacts: [JANE],
			value: '5,000',
		});
		expect(app.vault.readNote(file.path)?.frontmatter).toEqual({
			type: 'crm-deal',
			name: 'Acme – Expansion',
			company: '[[Acme Inc]]',
			contacts: ['[[Jane Doe]]'],
			stage: 'lead',
			value: 5000,
			currency: 'EUR',
			created: '2026-09-25',
			stage_history: ['2026-09-25 lead'],
		});
	});

	it('rejects non-numeric numbers', async () => {
		const { repo } = setup();
		await expect(repo.createEntity('deal', { name: 'X', value: 'lots' })).rejects.toThrow('Value should be a number');
	});

	it('logs an interaction and moves last_contacted forward only', async () => {
		const { app, repo, index } = setup();
		const file = await repo.logInteraction(
			{ kind: 'meeting', date: '2026-09-15', contacts: [JANE, MARIA], deal: [PILOT], summary: 'Pilot kickoff' },
			'Agenda',
		);

		expect(file.path).toBe('CRM/Interactions/2026-09-15 Meeting with Jane Doe and Maria Garcia.md');
		expect(app.vault.readNote(file.path)).toEqual(
			expect.objectContaining({
				frontmatter: {
					type: 'crm-interaction',
					kind: 'meeting',
					date: '2026-09-15',
					contacts: ['[[Jane Doe]]', '[[Maria Garcia]]'],
					deal: '[[Acme - Pilot]]',
					summary: 'Pilot kickoff',
				},
				body: 'Agenda',
			}),
		);
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

	it('sets and clears fields from UI values', async () => {
		const { app, repo } = setup();
		await repo.setField(JANE, fieldSpec('contact', 'role')!, ' COO ');
		await repo.setField(JANE, fieldSpec('contact', 'next_follow_up')!, '');
		await repo.setField(PILOT, fieldSpec('deal', 'contacts')!, [JANE]);
		await repo.setField(PILOT, fieldSpec('deal', 'probability')!, '0.5');
		await repo.moveDealStage(PILOT, 'negotiation');

		expect(app.vault.readNote(JANE)?.frontmatter).toMatchObject({ role: 'COO' });
		expect(app.vault.readNote(JANE)?.frontmatter).not.toHaveProperty('next_follow_up');
		expect(app.vault.readNote(PILOT)?.frontmatter).toMatchObject({
			contacts: ['[[Jane Doe]]'],
			probability: 0.5,
			stage: 'negotiation',
		});
		await expect(repo.updateFields('nope.md', {})).rejects.toThrow('Note not found');
	});
});
