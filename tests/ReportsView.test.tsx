import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsView } from '../src/ui/views/ReportsView';
import { niceScale } from '../src/ui/charts/scale';
import { SEED, renderWithCrm } from './fixtures';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const NOTES = {
	...SEED,
	'CRM/Deals/New.md': { type: 'crm-deal', stage: 'lead', stage_history: ['2026-09-24 lead'], value: 1000 },
	'CRM/Deals/Old.md': { type: 'crm-deal', stage: 'won', stage_history: ['2026-08-10 lead', '2026-09-02 won'], value: 4000 },
	'CRM/Quotes/Q.md': { type: 'crm-quote', status: 'accepted', issued: '2026-09-03', total: 100 },
	'CRM/Invoices/I.md': { type: 'crm-invoice', status: 'paid', issued: '2026-09-05', paid_on: '2026-09-15', total: 4000 },
};

const tile = (label: string) => screen.getByText(label, { selector: '.abc-stat-label' }).closest<HTMLElement>('.abc-stat')!;

describe('niceScale', () => {
	it('rounds the axis up to clean ticks', () => {
		expect(niceScale(7, true)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
		expect(niceScale(1234)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] });
		expect(niceScale(0, true).ticks).toEqual([0, 1, 2, 3, 4]);
		expect(niceScale(9, true)).toEqual({ max: 10, ticks: [0, 5, 10] });
		expect(niceScale(9)).toEqual({ max: 10, ticks: [0, 2.5, 5, 7.5, 10] });
	});
});

describe('ReportsView', () => {
	it('shows KPIs for the last 12 months with a comparison', () => {
		renderWithCrm(<ReportsView />, NOTES);
		expect(screen.getByText('Showing the last 12 months')).toBeInTheDocument();
		expect(within(tile('Leads')).getByText('2')).toBeInTheDocument();
		expect(within(tile('Deals won')).getByText('1')).toBeInTheDocument();
		expect(within(tile('Quote acceptance')).getByText('100%')).toBeInTheDocument();
		expect(within(tile('Average time to payment')).getByText('10 days')).toBeInTheDocument();
		expect(within(tile('Revenue paid')).getByText(/4,000/)).toBeInTheDocument();
		// Nothing happened in the 12 months before, so each non-zero KPI is "New".
		expect(within(tile('Leads')).getByText(/New/)).toBeInTheDocument();
	});

	it('switches granularity and compares against the previous range', () => {
		renderWithCrm(<ReportsView />, NOTES);
		fireEvent.click(screen.getByRole('radio', { name: 'Daily' }));
		expect(screen.getByRole('radio', { name: 'Daily' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByText('Showing the last 30 days')).toBeInTheDocument();
		// Last 30 days: one lead (Sep 24). Previous 30 days: one (Aug 10). No change.
		expect(within(tile('Leads')).getByText('1')).toBeInTheDocument();
		expect(within(tile('Leads')).getByText(/No change/)).toBeInTheDocument();

		fireEvent.click(screen.getByRole('radio', { name: 'Quarterly' }));
		expect(screen.getByText('Showing the last 8 quarters')).toBeInTheDocument();
	});

	it('has a legend, a keyboard tooltip and a table view for each chart', () => {
		renderWithCrm(<ReportsView />, NOTES);
		const activity = screen.getByRole('figure', { name: 'Leads, quotes and invoices' });
		expect(within(activity).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
			'Leads',
			'Quotes sent',
			'Invoices sent',
		]);

		const chart = within(activity).getByRole('img');
		fireEvent.focus(chart);
		const tooltip = within(activity).getByRole('status');
		expect(within(tooltip).getByText('September 2026')).toBeInTheDocument();
		fireEvent.keyDown(chart, { key: 'ArrowLeft' });
		expect(within(activity).getByRole('status')).toHaveTextContent('August 2026');

		fireEvent.click(within(activity).getByRole('button', { name: 'Table' }));
		const rows = within(activity).getAllByRole('row');
		expect(rows).toHaveLength(13);
		expect(within(rows[12]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['September 2026', '1', '1', '1']);
	});

	it('shows the open pipeline by stage with values at the bar ends', () => {
		renderWithCrm(<ReportsView />, NOTES);
		const pipeline = screen.getByRole('figure', { name: 'Open pipeline by stage' });
		expect(within(pipeline).getByText(/12,000 · 1 deal$/)).toBeInTheDocument();
		expect(within(pipeline).getAllByText(/0 · 0 deals$/)).toHaveLength(2);
	});
});
