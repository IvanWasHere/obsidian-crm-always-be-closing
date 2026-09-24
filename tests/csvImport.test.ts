import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoMap, importTargets, planImport, runImport, toTable } from '../src/core/csvImport';
import { exportTable } from '../src/core/csvExport';
import { parseCsv } from '../src/utils/csv';
import { setup } from './fixtures';

// New notes get `created: <today>`; pin today so expectations are exact.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});


const LINKEDIN = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Ada,Lovelace,https://www.linkedin.com/in/ada,ada@engine.org,Analytical Engines,Programmer,01 Sep 2026
Jane,Doe,https://www.linkedin.com/in/jane,jane@acme.com,Acme Inc,Head of Ops,02 Sep 2026
Grace,Hopper,https://www.linkedin.com/in/grace,,Navy,Rear Admiral,03 Sep 2026
,,https://www.linkedin.com/in/anon,,,,04 Sep 2026
Grace,Hopper,https://www.linkedin.com/in/grace2,,Navy,Admiral,05 Sep 2026
`;

const GOOGLE = `Name,Given Name,Family Name,E-mail 1 - Value,Phone 1 - Value,Organization 1 - Name,Organization 1 - Title,Group Membership
Linus T,Linus,Torvalds,linus@kernel.org,+1 555 0199,Linux Foundation,Fellow,* myContacts ::: Friends ::: Open Source
`;

describe('csv import', () => {
	it('finds the LinkedIn header after the preamble and maps its columns', () => {
		const { settings } = setup({});
		const table = toTable(parseCsv(LINKEDIN));
		expect(table.headers[0]).toBe('First Name');
		expect(table.rows).toHaveLength(5);

		const mapping = autoMap(table.headers, importTargets(settings));
		expect(mapping).toMatchObject({ name: -1, first_name: 0, last_name: 1, email: 3, company: 4, role: 5 });
	});

	it('maps Google Contacts columns, including labels as tags', () => {
		const { settings, index } = setup({});
		const table = toTable(parseCsv(GOOGLE));
		const mapping = autoMap(table.headers, importTargets(settings));
		expect(mapping).toMatchObject({ name: 0, email: 3, phone: 4, company: 5, role: 6, tags: 7 });

		const plan = planImport(table, mapping, index.getSnapshot());
		expect(plan.contacts[0]).toEqual({
			name: 'Linus T',
			values: {
				name: 'Linus T',
				email: 'linus@kernel.org',
				phone: '+1 555 0199',
				role: 'Fellow',
				tags: ['Friends', 'Open-Source'],
			},
			companyName: 'Linux Foundation',
			body: '',
		});
	});

	it('plans an import, skipping existing contacts, in-file duplicates and unnamed rows', () => {
		const { settings, index } = setup();
		const table = toTable(parseCsv(LINKEDIN));
		const plan = planImport(table, autoMap(table.headers, importTargets(settings)), index.getSnapshot());

		expect(plan.contacts.map((c) => c.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
		expect(plan.duplicates).toBe(2); // Jane Doe exists; Grace Hopper appears twice
		expect(plan.unnamed).toBe(1);
		// Acme Inc already exists (matched case-insensitively).
		expect(plan.newCompanies).toEqual(['Analytical Engines', 'Navy']);
	});

	it('creates companies and linked contacts', async () => {
		const { app, settings, index, repo } = setup();
		const table = toTable(parseCsv(LINKEDIN));
		const plan = planImport(table, autoMap(table.headers, importTargets(settings)), index.getSnapshot());
		const progress: number[] = [];

		const result = await runImport(plan, index.getSnapshot(), repo, {
			createCompanies: true,
			onProgress: (done) => progress.push(done),
		});

		expect(result).toEqual({ contacts: 2, companies: 2, failed: [] });
		expect(progress).toEqual([1, 2]);
		expect(app.vault.readNote('CRM/Companies/Navy.md')?.frontmatter).toMatchObject({ type: 'crm-company', name: 'Navy' });
		expect(app.vault.readNote('CRM/Contacts/Ada Lovelace.md')?.frontmatter).toEqual({
			type: 'crm-contact',
			name: 'Ada Lovelace',
			company: '[[Analytical Engines]]',
			role: 'Programmer',
			email: 'ada@engine.org',
			status: 'active',
			created: '2026-09-25',
		});
	});

	it('links to company names without creating them when asked', async () => {
		const { app, settings, index, repo } = setup({});
		const table = toTable(parseCsv(LINKEDIN));
		const plan = planImport(table, autoMap(table.headers, importTargets(settings)), index.getSnapshot());
		const result = await runImport(plan, index.getSnapshot(), repo, { createCompanies: false });

		expect(result.companies).toBe(0);
		expect(app.vault.readNote('CRM/Companies/Navy.md')).toBeUndefined();
		expect(app.vault.readNote('CRM/Contacts/Grace Hopper.md')?.frontmatter?.company).toBe('[[Navy]]');
	});

	it('imports custom fields by label', () => {
		const { settings, index } = setup({});
		settings.customFields.contact.push({ key: 'linkedin', label: 'URL', kind: 'url' });
		const table = toTable(parseCsv(LINKEDIN));
		const plan = planImport(table, autoMap(table.headers, importTargets(settings)), index.getSnapshot());
		expect(plan.contacts[0]!.values.linkedin).toBe('https://www.linkedin.com/in/ada');
	});
});

describe('csv export', () => {
	it('exports frontmatter keys with links as names', () => {
		const { settings, index } = setup();
		const [header, ...rows] = exportTable('deal', index.getSnapshot(), settings);
		expect(header).toEqual([
			'name',
			'company',
			'contacts',
			'stage',
			'value',
			'currency',
			'expected_close',
			'probability',
			'path',
		]);
		expect(rows[0]).toEqual([
			'Acme – Pilot',
			'Acme Inc',
			'Jane Doe; Maria Garcia',
			'proposal',
			'12000',
			'EUR',
			'',
			'',
			'CRM/Deals/Acme - Pilot.md',
		]);
	});

	it('includes interaction titles, tags and custom fields', () => {
		const { settings, index } = setup({
			'CRM/Contacts/Ann.md': { tags: ['a', 'b'], vip: true, linkedin: 'x' },
			'CRM/Interactions/2026-09-01 Call.md': { kind: 'call', contacts: ['[[Ann]]', '[[Ghost]]'] },
		});
		settings.customFields.contact.push({ key: 'vip', label: 'VIP', kind: 'checkbox' });
		const contacts = exportTable('contact', index.getSnapshot(), settings);
		expect(contacts[0]!.slice(-3)).toEqual(['tags', 'vip', 'path']);
		expect(contacts[1]!.slice(-3)).toEqual(['a; b', 'true', 'CRM/Contacts/Ann.md']);

		const interactions = exportTable('interaction', index.getSnapshot(), settings);
		expect(interactions[0]![0]).toBe('name');
		expect(interactions[1]!.slice(0, 4)).toEqual(['2026-09-01 Call', 'call', '', 'Ann; Ghost']);
	});
});
