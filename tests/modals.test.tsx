import type { ReactNode } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type CrmPlugin from '../src/main';
import { ExportTypeModal, QuickLogModal, exportCsv } from '../src/obsidian/modals';
import { parseCsv } from '../src/utils/csv';
import { Notice } from './mocks/obsidian';
import { SEED, renderWithCrm, setup } from './fixtures';

// Capture React modals instead of opening them, so their content can be rendered in tests.
const modalsOpened = vi.hoisted(() => [] as { title: string; render: (close: () => void) => ReactNode }[]);
vi.mock('../src/obsidian/ReactModal', () => ({
	ReactModal: class {
		constructor(_plugin: unknown, title: string, render: (close: () => void) => ReactNode) {
			modalsOpened.push({ title, render });
		}
		open() {}
	},
}));

function plugin(notes = SEED) {
	const ctx = setup(notes);
	return { ctx, plugin: { app: ctx.app, settings: ctx.settings, index: ctx.index, repo: ctx.repo } as unknown as CrmPlugin };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

describe('QuickLogModal', () => {
	it('offers non-archived contacts and open deals', () => {
		const { plugin: p } = plugin({
			...SEED,
			'CRM/Contacts/Gone.md': { type: 'crm-contact', status: 'archived' },
			'CRM/Deals/Done.md': { type: 'crm-deal', stage: 'won' },
		});
		const names = new QuickLogModal(p).getItems().map((e) => e.name);
		expect(names).toEqual(['Jane Doe', 'John Smith', 'Maria Garcia', 'Acme – Pilot', 'Globex – Discovery']);
	});

	it('opens a short log form pre-filled from the choice', async () => {
		const ctx = renderWithCrm(<div />);
		const p = ctx.plugin;
		const modal = new QuickLogModal(p);
		modal.onChooseItem(modal.getItems().find((e) => e.name === 'Acme – Pilot')!);

		const opened = modalsOpened[modalsOpened.length - 1]!;
		expect(opened.title).toBe('Log interaction: Acme – Pilot');
		ctx.rerender(<>{opened.render(() => {})}</>);
		// Only kind, summary and notes are shown; links and date are filled in.
		expect(screen.getAllByRole('combobox')).toHaveLength(1); // the Kind select; no contact/deal pickers
		expect(screen.queryByLabelText('Date')).toBeNull();

		fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Pricing call' } });
		fireEvent.click(screen.getByRole('button', { name: 'Log' }));
		const path = 'CRM/Interactions/2026-09-25 Call with Jane Doe and Maria Garcia.md';
		await waitFor(() => expect(ctx.app.vault.readNote(path)).toBeDefined());
		expect(ctx.app.vault.readNote(path)?.frontmatter).toEqual({
			type: 'crm-interaction',
			kind: 'call',
			date: '2026-09-25',
			contacts: ['[[Jane Doe]]', '[[Maria Garcia]]'],
			deal: '[[Acme - Pilot]]',
			summary: 'Pricing call',
		});
	});
});

describe('CSV export', () => {
	it('writes a dated CSV into CRM/Exports and replaces it on re-export', async () => {
		const { ctx, plugin: p } = plugin();
		const path = await exportCsv(p, 'contact');
		expect(path).toBe('CRM/Exports/contacts 2026-09-25.csv');
		expect(ctx.app.vault.folders.has('CRM/Exports')).toBe(true);

		const rows = parseCsv(ctx.app.vault.readNote(path)!.body);
		expect(rows[0]![0]).toBe('name');
		expect(rows.slice(1).map((r) => r[0])).toEqual(['Jane Doe', 'John Smith', 'Maria Garcia']);
		expect(Notice.shown[Notice.shown.length - 1]).toBe(`Exported 3 contacts to ${path}`);

		ctx.app.vault.addNote('CRM/Contacts/Zed.md', { type: 'crm-contact' });
		ctx.index.flush();
		await exportCsv(p, 'contact');
		expect(parseCsv(ctx.app.vault.readNote(path)!.body)).toHaveLength(5);
	});

	it('lets you pick the type by typing', () => {
		const { plugin: p } = plugin();
		expect(new ExportTypeModal(p).getSuggestions('co')).toEqual(['contact', 'company']);
	});
});
