import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldValues } from '../src/core/fields';
import { EntityForm } from '../src/ui/components/EntityForm';
import { BillingView } from '../src/ui/views/BillingView';
import { EntityPanel } from '../src/ui/views/EntityPanel';
import { SEED, renderWithCrm } from './fixtures';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const DOCS = {
	...SEED,
	'CRM/Invoices/INV-2026-0001 Acme Inc.md': {
		type: 'crm-invoice',
		number: 'INV-2026-0001',
		status: 'sent',
		company: '[[Acme Inc]]',
		issued: '2026-08-01',
		due: '2026-08-31',
		items: [{ description: 'Pilot setup', qty: 1, price: 1000, tax: 20 }],
	},
	'CRM/Invoices/INV-2026-0002 Globex.md': {
		type: 'crm-invoice',
		number: 'INV-2026-0002',
		status: 'paid',
		company: '[[Globex]]',
		issued: '2026-09-01',
		paid_on: '2026-09-10',
		total: 500,
	},
	'CRM/Quotes/Q-2026-0001 Acme Inc.md': {
		type: 'crm-quote',
		number: 'Q-2026-0001',
		status: 'sent',
		company: '[[Acme Inc]]',
		issued: '2026-09-20',
		items: [{ description: 'Training', qty: 2, price: 100, tax: 0 }],
	},
};

const firstCells = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent);

describe('BillingView', () => {
	it('lists invoices newest first with status, totals and an overdue summary', () => {
		renderWithCrm(<BillingView />, DOCS);
		expect(firstCells()).toEqual(['INV-2026-0002', 'INV-2026-0001']);
		const overdueRow = screen.getAllByRole('row')[2]!;
		expect(within(overdueRow).getByText('overdue')).toBeInTheDocument();
		expect(within(overdueRow).getByText(/1,200/)).toBeInTheDocument();
		expect(screen.getByText(/Outstanding/).textContent).toMatch(/1,200/);
		expect(screen.getByText(/Overdue/).textContent).toMatch(/1,200/);
	});

	it('filters by status (including overdue) and switches to quotes', () => {
		renderWithCrm(<BillingView />, DOCS);
		fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'paid' } });
		expect(firstCells()).toEqual(['INV-2026-0002']);
		fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'overdue' } });
		expect(firstCells()).toEqual(['INV-2026-0001']);

		fireEvent.click(screen.getByRole('tab', { name: 'Quotes' }));
		expect(firstCells()).toEqual(['Q-2026-0001']);
		expect(screen.getByRole('button', { name: 'Valid until' })).toBeInTheDocument();
	});

	it('searches line item descriptions', () => {
		renderWithCrm(<BillingView />, DOCS);
		fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pilot' } });
		expect(firstCells()).toEqual(['INV-2026-0001']);
	});
});

describe('line items in forms', () => {
	it('edits rows and shows running totals', async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderWithCrm(
			<EntityForm
				type="invoice"
				initial={{ number: 'INV-2026-0003', status: 'draft', items: [{ description: '', qty: '1', price: '', tax: '20' }] }}
				submitLabel="Create"
				onSubmit={onSubmit}
			/>,
		);
		fireEvent.change(screen.getByLabelText('Line 1 description'), { target: { value: 'Consulting' } });
		fireEvent.change(screen.getByLabelText('Line 1 quantity'), { target: { value: '3' } });
		fireEvent.change(screen.getByLabelText('Line 1 price'), { target: { value: '100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
		fireEvent.change(screen.getByLabelText('Line 2 price'), { target: { value: '50' } });
		fireEvent.change(screen.getByLabelText('Line 2 tax'), { target: { value: '0' } });

		const totals = screen.getByText('Total').closest('dl')!;
		expect(within(totals).getAllByRole('definition').map((d) => d.textContent)).toEqual(['350.00', '60.00', '410.00']);

		fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));
		expect(within(totals).getAllByRole('definition').map((d) => d.textContent)).toEqual(['300.00', '60.00', '360.00']);

		fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect((onSubmit.mock.calls[0]![0] as FieldValues).items).toEqual([{ description: 'Consulting', qty: '3', price: '100', tax: '20' }]);
	});
});

describe('EntityPanel billing', () => {
	function open(ctx: ReturnType<typeof renderWithCrm>, path: string) {
		act(() => ctx.app.workspace.setActiveFile(ctx.app.vault.file(path)));
	}

	it('shows status, total and next actions for an invoice', async () => {
		const ctx = renderWithCrm(<EntityPanel />, DOCS);
		open(ctx, 'CRM/Invoices/INV-2026-0001 Acme Inc.md');
		expect(screen.getByRole('heading', { name: 'INV-2026-0001' })).toBeInTheDocument();
		expect(screen.getAllByText('overdue')[0]).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: /Mark as paid/ }));
		await waitFor(() =>
			expect(ctx.app.vault.readNote('CRM/Invoices/INV-2026-0001 Acme Inc.md')?.frontmatter).toMatchObject({
				status: 'paid',
				paid_on: '2026-09-25',
			}),
		);
	});

	it('lists quotes and invoices on the company, and hides empty lists', () => {
		const ctx = renderWithCrm(<EntityPanel />, DOCS);
		open(ctx, 'CRM/Companies/Acme Inc.md');
		const invoices = screen.getByRole('heading', { name: /Invoices/ }).closest('section')!;
		expect(within(invoices).getByText('INV-2026-0001')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Quotes/ })).toBeInTheDocument();

		open(ctx, 'CRM/Contacts/John Smith.md');
		expect(screen.queryByRole('heading', { name: /Quotes/ })).toBeNull();
	});

	it('offers accept/decline and invoice creation for a sent quote', async () => {
		const ctx = renderWithCrm(<EntityPanel />, DOCS);
		open(ctx, 'CRM/Quotes/Q-2026-0001 Acme Inc.md');
		expect(screen.getByRole('button', { name: /Accepted/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /Create invoice/ }));
		await waitFor(() => expect(ctx.app.vault.readNote('CRM/Invoices/INV-2026-0003 Acme Inc.md')).toBeDefined());
		expect(ctx.app.workspace.opened[ctx.app.workspace.opened.length - 1]?.path).toBe('CRM/Invoices/INV-2026-0003 Acme Inc.md');
	});
});
