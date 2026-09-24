import { describe, expect, it } from 'vitest';
import { bucketIndex, bucketStart, buildReport, makeBuckets } from '../src/core/stats';
import { setup } from './fixtures';

const TODAY = '2026-09-25'; // a Friday

describe('buckets', () => {
	it('finds bucket starts (weeks start Monday)', () => {
		expect(bucketStart('day', TODAY)).toBe('2026-09-25');
		expect(bucketStart('week', TODAY)).toBe('2026-09-21');
		expect(bucketStart('week', '2026-09-21')).toBe('2026-09-21');
		expect(bucketStart('week', '2026-09-27')).toBe('2026-09-21');
		expect(bucketStart('month', TODAY)).toBe('2026-09-01');
		expect(bucketStart('quarter', TODAY)).toBe('2026-07-01');
		expect(bucketStart('quarter', '2026-12-31')).toBe('2026-10-01');
	});

	it('builds contiguous buckets ending with the current one', () => {
		const q = makeBuckets('quarter', TODAY, 3);
		expect(q.map((b) => [b.start, b.end, b.label])).toEqual([
			['2026-01-01', '2026-04-01', 'Q1 2026'],
			['2026-04-01', '2026-07-01', 'Q2 2026'],
			['2026-07-01', '2026-10-01', 'Q3 2026'],
		]);
		const months = makeBuckets('month', '2026-01-15', 3);
		expect(months.map((b) => b.start)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
		const days = makeBuckets('day', TODAY, 30);
		expect(days).toHaveLength(30);
		expect(days[29]!.start).toBe(TODAY);
		expect(bucketIndex(days, '2026-08-27')).toBe(0);
		expect(bucketIndex(days, '2026-08-26')).toBe(-1);
		expect(makeBuckets('week', TODAY, 2)[0]!.title).toMatch(/^Week of /);
	});
});

describe('buildReport', () => {
	const notes = {
		// Leads: entered "lead" this month (2) and last month (1).
		'CRM/Deals/A.md': { type: 'crm-deal', stage: 'proposal', stage_history: ['2026-09-02 lead', '2026-09-10 proposal'] },
		'CRM/Deals/B.md': { type: 'crm-deal', stage: 'won', value: 5000, stage_history: ['2026-09-05 lead', '2026-09-20 won'] },
		'CRM/Deals/C.md': { type: 'crm-deal', stage: 'lost', stage_history: ['2026-08-15 lead', '2026-09-01 lost'] },
		// No history: counts as entering its current stage on `created`.
		'CRM/Deals/D.md': { type: 'crm-deal', stage: 'lead', created: '2026-09-24', value: 100 },
		// Other currency: counted as a deal, left out of money.
		'CRM/Deals/E.md': { type: 'crm-deal', stage: 'won', value: 999, currency: 'USD', stage_history: ['2026-09-21 won'] },

		'CRM/Quotes/Q1.md': { type: 'crm-quote', number: 'Q-2026-0001', status: 'accepted', issued: '2026-09-03' },
		'CRM/Quotes/Q2.md': { type: 'crm-quote', number: 'Q-2026-0002', status: 'declined', issued: '2026-09-04' },
		'CRM/Quotes/Q3.md': { type: 'crm-quote', number: 'Q-2026-0003', status: 'sent', issued: '2026-09-05' },
		'CRM/Quotes/Q4.md': { type: 'crm-quote', number: 'Q-2026-0004', status: 'draft', issued: '2026-09-06' },

		'CRM/Invoices/I1.md': {
			type: 'crm-invoice',
			status: 'paid',
			issued: '2026-09-01',
			paid_on: '2026-09-11',
			items: [{ description: 'Work', qty: 2, price: 500, tax: 20 }],
		},
		'CRM/Invoices/I2.md': { type: 'crm-invoice', status: 'sent', issued: '2026-08-01', due: '2026-08-31', total: 300 },
		'CRM/Invoices/I3.md': { type: 'crm-invoice', status: 'sent', issued: '2026-09-20', due: '2026-10-20', total: 200 },
		'CRM/Invoices/I4.md': { type: 'crm-invoice', status: 'draft', issued: '2026-09-21', total: 50 },

		'CRM/Contacts/New.md': { type: 'crm-contact', created: '2026-09-15' },
		'CRM/Interactions/1.md': { type: 'crm-interaction', kind: 'call', date: '2026-09-15' },
		'CRM/Interactions/2.md': { type: 'crm-interaction', kind: 'email', date: '2026-08-15' },
	};

	it('counts events per month with previous-range comparisons', () => {
		const { index, settings } = setup(notes);
		const r = buildReport(index.getSnapshot(), settings, 'month', TODAY);
		const last = (xs: number[]) => xs[xs.length - 1];

		expect(r.buckets).toHaveLength(12);
		expect(last(r.counts.leads)).toBe(3); // A, B, D
		expect(r.counts.leads[10]).toBe(1); // C in August
		expect(r.kpis.leads).toEqual({ value: 4, previous: 0 });

		expect(last(r.counts.won)).toBe(2); // B and E
		expect(last(r.counts.lost)).toBe(1);
		expect(r.kpis.wonValue.value).toBe(5000); // E is USD

		expect(last(r.counts.quotesSent)).toBe(3); // drafts don't count
		expect(r.kpis.acceptanceRate.value).toBe(0.5);

		expect(last(r.counts.invoicesSent)).toBe(2);
		expect(r.counts.invoicesSent[10]).toBe(1);
		expect(last(r.money.invoiced)).toBe(1400); // 1200 gross + 200
		expect(last(r.money.paid)).toBe(1200);
		expect(r.kpis.avgDaysToPay.value).toBe(10);

		expect(r.current).toEqual({ outstanding: 500, overdue: 300, overdueCount: 1, openPipeline: 100 });
		expect(r.pipelineByStage.map((s) => [s.stage, s.count])).toEqual([
			['lead', 1],
			['qualified', 0],
			['proposal', 1],
			['negotiation', 0],
		]);
		expect(r.excludedForCurrency).toBe(1);

		expect(last(r.interactions.call)).toBe(1);
		expect(r.interactions.email[10]).toBe(1);
		expect(last(r.counts.newContacts)).toBe(1);
	});

	it('compares with the previous range at daily granularity', () => {
		const { index, settings } = setup(notes);
		const r = buildReport(index.getSnapshot(), settings, 'day', TODAY);
		// Last 30 days: Aug 27 – Sep 25. The previous 30 days include Aug 15 (C's lead).
		expect(r.kpis.leads).toEqual({ value: 3, previous: 1 });
		expect(r.kpis.acceptanceRate.previous).toBeNull();
	});
});
