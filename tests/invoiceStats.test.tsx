import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoicesByStatus } from '../src/core/stats';
import { DashboardView } from '../src/ui/views/DashboardView';
import { SEED, renderWithCrm, setup } from './fixtures';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const INVOICES = {
	...SEED,
	'CRM/Invoices/A.md': { type: 'crm-invoice', status: 'paid', issued: '2026-07-10', paid_on: '2026-09-05', total: 1000 },
	'CRM/Invoices/B.md': { type: 'crm-invoice', status: 'sent', issued: '2026-08-01', due: '2026-08-31', total: 400 },
	'CRM/Invoices/C.md': { type: 'crm-invoice', status: 'sent', issued: '2026-09-20', due: '2026-10-20', total: 250 },
	'CRM/Invoices/D.md': { type: 'crm-invoice', status: 'draft', created: '2026-09-22', total: 300 },
	'CRM/Invoices/E.md': { type: 'crm-invoice', status: 'void', issued: '2026-08-15', total: 50 },
	'CRM/Invoices/F.md': { type: 'crm-invoice', status: 'sent', issued: '2026-09-02', total: 777, currency: 'USD' },
};

describe('invoicesByStatus', () => {
	it('places every invoice by issue date and splits sent into pending and overdue', () => {
		const { index, settings } = setup(INVOICES);
		const { buckets, amounts, excluded } = invoicesByStatus(index.getSnapshot(), settings, 'month', '2026-09-25');
		const at = (month: string) => buckets.findIndex((b) => b.start === `2026-${month}-01`);
		expect(amounts.paid[at('07')]).toBe(1000);
		expect(amounts.overdue[at('08')]).toBe(400);
		expect(amounts.void[at('08')]).toBe(50);
		expect(amounts.pending[at('09')]).toBe(250);
		expect(amounts.draft[at('09')]).toBe(300); // no issue date: placed by `created`
		expect(excluded).toBe(1);
	});
});

describe('dashboard invoices chart', () => {
	it('shows every status in one stacked chart, with tiles above', () => {
		renderWithCrm(<DashboardView />, INVOICES);
		const panel = screen.getByRole('region', { name: 'Invoices' });
		const tile = (label: RegExp) => within(panel).getByText(label, { selector: '.abc-stat-label' }).closest<HTMLElement>('.abc-stat')!;
		expect(within(tile(/Pending now/)).getByText(/650/)).toBeInTheDocument();
		expect(within(tile(/Overdue now \(1\)/)).getByText(/400/)).toBeInTheDocument();

		const charts = within(panel).getAllByRole('figure');
		expect(charts.map((f) => f.getAttribute('aria-label'))).toEqual(['Invoices by status']);
		expect(within(charts[0]!).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
			'Pending',
			'Overdue',
			'Paid',
			'Draft',
			'Void',
		]);
		expect(within(panel).getByText(/other currencies are left out/)).toBeInTheDocument();
	});

	it('switches period; the table has every status per period and a tooltip total', () => {
		renderWithCrm(<DashboardView />, INVOICES);
		const panel = screen.getByRole('region', { name: 'Invoices' });
		fireEvent.click(within(panel).getByRole('radio', { name: 'Quarterly' }));
		expect(within(panel).getByText(/per quarter · last 8 quarters/)).toBeInTheDocument();

		const chart = within(panel).getByRole('img');
		fireEvent.focus(chart);
		expect(within(panel).getByRole('status')).toHaveTextContent(/Q3 2026.*Total/);

		fireEvent.click(within(panel).getByRole('button', { name: 'Table' }));
		const rows = within(panel).getAllByRole('row');
		const q3 = within(rows[rows.length - 1]!)
			.getAllByRole('cell')
			.map((c, i) => (i === 0 ? c.textContent : (c.textContent ?? '').replace(/[^\d.]/g, '')));
		// Pending, Overdue, Paid, Draft, Void
		expect(q3).toEqual(['Q3 2026', '250', '400', '1000', '300', '50']);
	});

	it('is hidden until there are invoices', () => {
		renderWithCrm(<DashboardView />);
		expect(screen.queryByRole('region', { name: 'Invoices' })).toBeNull();
	});
});
