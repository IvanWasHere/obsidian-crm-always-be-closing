import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextNumber, parseLineItems, parseStageHistory, totalsOf } from '../src/core/billing';
import { fieldSpec } from '../src/core/fields';
import { parseEntity } from '../src/core/schema';
import { SEED, setup } from './fixtures';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const ACME = 'CRM/Companies/Acme Inc.md';
const JANE = 'CRM/Contacts/Jane Doe.md';
const PILOT = 'CRM/Deals/Acme - Pilot.md';

describe('line items', () => {
	it('parses items with defaults and counts unreadable ones', () => {
		expect(
			parseLineItems([
				{ description: 'Setup', qty: 1, price: 8000, tax: 19 },
				{ description: 'Days', qty: '2', price: '1,5' },
				{ qty: 3 },
				'junk',
			]),
		).toEqual({
			items: [
				{ description: 'Setup', qty: 1, price: 8000, tax: 19 },
				{ description: 'Days', qty: 2, price: 1.5, tax: 0 },
			],
			invalid: 2,
		});
	});

	it('totals net, tax and gross to the cent', () => {
		expect(
			totalsOf([
				{ description: 'a', qty: 3, price: 33.33, tax: 19 },
				{ description: 'b', qty: 1, price: 10, tax: 0 },
			]),
		).toEqual({ net: 109.99, tax: 19, gross: 128.99 });
	});

	it('parses quotes and invoices, falling back to `total` without items', () => {
		const opts = { stages: ['lead'] };
		const quote = parseEntity('quote', 'CRM/Quotes/Q.md', {
			number: 'Q-2026-0001',
			status: 'sent',
			items: [{ description: 'x', qty: 2, price: 50, tax: 10 }],
		}, opts);
		expect(quote).toMatchObject({ name: 'Q-2026-0001', status: 'sent', totals: { net: 100, tax: 10, gross: 110 } });

		const invoice = parseEntity('invoice', 'CRM/Invoices/I.md', { status: 'paid', total: 300, paid_on: '2026-09-01' }, opts);
		expect(invoice).toMatchObject({ name: 'I', status: 'paid', paidOn: '2026-09-01', totals: { gross: 300 } });

		const bad = parseEntity('invoice', 'x.md', { status: 'maybe', items: 'nope' }, opts);
		expect(bad.issues).toEqual(['1 line item is unreadable', 'status "maybe" should be one of: draft, sent, paid, void']);
	});
});

describe('numbering and stage history', () => {
	it('numbers per year from the highest existing number', () => {
		const { index, settings } = setup({
			'CRM/Invoices/a.md': { type: 'crm-invoice', number: 'INV-2026-0007' },
			'CRM/Invoices/b.md': { type: 'crm-invoice', number: 'INV-2026-0002' },
			'CRM/Invoices/c.md': { type: 'crm-invoice', number: 'INV-2025-0099' },
			'CRM/Invoices/d.md': { type: 'crm-invoice', number: 'custom' },
		});
		expect(nextNumber(index.getSnapshot(), 'invoice', settings, '2026-09-25')).toBe('INV-2026-0008');
		expect(nextNumber(index.getSnapshot(), 'quote', settings, '2026-09-25')).toBe('Q-2026-0001');
		expect(nextNumber(index.getSnapshot(), 'invoice', settings, '2027-01-02')).toBe('INV-2027-0001');
	});

	it('parses stage history and sorts it by date', () => {
		expect(parseStageHistory(['2026-09-20 proposal', 'nonsense', '2026-09-01 lead'])).toEqual([
			{ date: '2026-09-01', stage: 'lead' },
			{ date: '2026-09-20', stage: 'proposal' },
		]);
	});
});

describe('repository billing actions', () => {
	it('creates an invoice named after its number and company, with line items', async () => {
		const { app, repo } = setup();
		const file = await repo.createEntity('invoice', {
			number: 'INV-2026-0001',
			company: [ACME],
			contact: [JANE],
			deal: [PILOT],
			issued: '2026-09-25',
			due: '2026-10-25',
			items: [
				{ description: 'Pilot setup', qty: '1', price: '8000', tax: '19' },
				{ description: '', qty: '1', price: '', tax: '19' },
			],
		});
		expect(file.path).toBe('CRM/Invoices/INV-2026-0001 Acme Inc.md');
		expect(app.vault.readNote(file.path)?.frontmatter).toEqual({
			type: 'crm-invoice',
			number: 'INV-2026-0001',
			status: 'draft',
			company: '[[Acme Inc]]',
			contact: '[[Jane Doe]]',
			deal: '[[Acme - Pilot]]',
			issued: '2026-09-25',
			due: '2026-10-25',
			currency: 'EUR',
			items: [{ description: 'Pilot setup', qty: 1, price: 8000, tax: 19 }],
			created: '2026-09-25',
		});
	});

	it('rejects non-numeric line item cells', async () => {
		const { repo } = setup();
		await expect(
			repo.createEntity('quote', { number: 'Q-1', items: [{ description: 'x', qty: 'two', price: '1', tax: '0' }] }),
		).rejects.toThrow('Line 1: quantity should be a number');
	});

	it('marks sent (filling dates from settings) and paid', async () => {
		const { app, repo } = setup({ 'CRM/Invoices/I.md': { type: 'crm-invoice', status: 'draft' } });
		await repo.markSent('CRM/Invoices/I.md');
		expect(app.vault.readNote('CRM/Invoices/I.md')?.frontmatter).toMatchObject({
			status: 'sent',
			issued: '2026-09-25',
			due: '2026-10-25',
		});
		await repo.markPaid('CRM/Invoices/I.md');
		expect(app.vault.readNote('CRM/Invoices/I.md')?.frontmatter).toMatchObject({ status: 'paid', paid_on: '2026-09-25' });
	});

	it('converts a quote into a linked draft invoice and accepts the quote', async () => {
		const { app, repo, index } = setup({
			...SEED,
			'CRM/Quotes/Q-2026-0001 Acme Inc.md': {
				type: 'crm-quote',
				number: 'Q-2026-0001',
				status: 'sent',
				company: '[[Acme Inc]]',
				deal: '[[Acme - Pilot]]',
				currency: 'USD',
				items: [{ description: 'Setup', qty: 1, price: 100, tax: 0 }],
			},
		});
		const quote = index.getSnapshot().get('CRM/Quotes/Q-2026-0001 Acme Inc.md', 'quote')!;
		const file = await repo.convertQuoteToInvoice(quote, index.getSnapshot(), 'INV-2026-0001');

		expect(app.vault.readNote(file.path)?.frontmatter).toMatchObject({
			number: 'INV-2026-0001',
			status: 'draft',
			company: '[[Acme Inc]]',
			deal: '[[Acme - Pilot]]',
			quote: '[[Q-2026-0001 Acme Inc]]',
			currency: 'USD',
			due: '2026-10-25',
			items: [{ description: 'Setup', qty: 1, price: 100, tax: 0 }],
		});
		expect(app.vault.readNote('CRM/Quotes/Q-2026-0001 Acme Inc.md')?.frontmatter?.status).toBe('accepted');

		index.flush();
		const crm = index.getSnapshot();
		expect(crm.invoicesOf(quote.path).map((i) => i.name)).toEqual(['INV-2026-0001']);
		expect(crm.invoicesOf(ACME)).toHaveLength(1);
		expect(crm.quoteOf(file.path)?.path).toBe(quote.path);
	});

	it('edits line items through setField', async () => {
		const { app, repo } = setup({ 'CRM/Quotes/Q.md': { type: 'crm-quote', number: 'Q-1' } });
		await repo.setField('CRM/Quotes/Q.md', fieldSpec('quote', 'items')!, [
			{ description: 'A', qty: '2', price: '10,5', tax: '' },
		]);
		expect(app.vault.readNote('CRM/Quotes/Q.md')?.frontmatter?.items).toEqual([
			{ description: 'A', qty: 2, price: 10.5, tax: 0 },
		]);
	});
});

describe('deal stage history', () => {
	it('records moves, keeping the stage the deal was in before tracking started', async () => {
		const { app, repo } = setup({
			'CRM/Deals/Old.md': { type: 'crm-deal', stage: 'lead', created: '2026-08-01' },
		});
		await repo.moveDealStage('CRM/Deals/Old.md', 'proposal');
		await repo.moveDealStage('CRM/Deals/Old.md', 'proposal');
		expect(app.vault.readNote('CRM/Deals/Old.md')?.frontmatter?.stage_history).toEqual([
			'2026-08-01 lead',
			'2026-09-25 proposal',
		]);
	});

	it('records stage edits made directly in frontmatter', async () => {
		const { app, index, repo } = setup({
			'CRM/Deals/D.md': { type: 'crm-deal', stage: 'lead', created: '2026-09-01', stage_history: ['2026-09-01 lead'] },
		});
		index.onDealStageChange = (path, stage, previous) => void repo.recordStage(path, stage, previous);

		app.vault.setFrontmatter('CRM/Deals/D.md', { ...app.vault.readNote('CRM/Deals/D.md')!.frontmatter, stage: 'won' });
		index.flush();
		await vi.waitFor(() =>
			expect(app.vault.readNote('CRM/Deals/D.md')?.frontmatter?.stage_history).toEqual([
				'2026-09-01 lead',
				'2026-09-25 won',
			]),
		);
		// The index sees the history write but no new stage change, so nothing is appended twice.
		index.flush();
		expect(app.vault.readNote('CRM/Deals/D.md')?.frontmatter?.stage_history).toHaveLength(2);
	});
});
