import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taxBreakdown } from '../src/core/billing';
import { invoiceDocument } from '../src/core/invoiceDocument';
import type CrmPlugin from '../src/main';
import { exportBillingPdf, pdfPathFor } from '../src/obsidian/pdf';
import { renderInvoice } from '../src/pdf/renderInvoice';
import { setup } from './fixtures';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const INVOICE = 'CRM/Invoices/INV-2026-0007 Đorđević.md';
const NOTES = {
	'CRM/Companies/Đorđević.md': {
		type: 'crm-company',
		name: 'Đorđević i Sinovi d.o.o.',
		address: 'Kneza Miloša 12\n11000 Beograd',
		tax_id: 'RS108765432',
	},
	'CRM/Contacts/Ana Čolić.md': { type: 'crm-contact', email: 'ana@sinovi.rs', company: '[[Đorđević]]' },
	'CRM/Quotes/Q-2026-0002.md': { type: 'crm-quote', number: 'Q-2026-0002', status: 'accepted', valid_until: '2026-10-01' },
	[INVOICE]: {
		type: 'crm-invoice',
		number: 'INV-2026-0007',
		status: 'sent',
		company: '[[Đorđević]]',
		contact: '[[Ana Čolić]]',
		quote: '[[Q-2026-0002]]',
		issued: '2026-09-25',
		due: '2026-10-25',
		currency: 'EUR',
		items: [
			{ description: 'Pilot setup', qty: 1, price: 8000, tax: 20 },
			{ description: 'Support', qty: 3, price: 95, tax: 10 },
			{ description: 'Travel', qty: 1, price: 345.5, tax: 0 },
		],
	},
};

function withBusiness(settings: ReturnType<typeof setup>['settings']) {
	settings.billing = {
		...settings.billing,
		businessName: 'Marinković Consulting',
		businessAddress: 'Bulevar 6\n21000 Novi Sad',
		businessEmail: 'ivan@example.com',
		bankDetails: 'IBAN RS35 1600\nBIC DBDBRSBG',
		paymentNote: 'Please pay within 30 days.',
	};
}

describe('taxBreakdown', () => {
	it('groups tax by rate and skips 0%', () => {
		expect(
			taxBreakdown([
				{ description: 'a', qty: 1, price: 100, tax: 20 },
				{ description: 'b', qty: 2, price: 50, tax: 20 },
				{ description: 'c', qty: 3, price: 10, tax: 7 },
				{ description: 'd', qty: 1, price: 999, tax: 0 },
			]),
		).toEqual([
			{ rate: 7, base: 30, tax: 2.1 },
			{ rate: 20, base: 200, tax: 40 },
		]);
	});
});

describe('invoiceDocument', () => {
	it('assembles sender, recipient, rows, totals and payment details', () => {
		const { index, settings } = setup(NOTES);
		withBusiness(settings);
		const doc = index.getSnapshot().get(INVOICE, 'invoice')!;
		const d = invoiceDocument(doc, index.getSnapshot(), settings);

		expect(d.title).toBe('Invoice');
		expect(d.number).toBe('INV-2026-0007');
		expect(d.meta.map((m) => m.label)).toEqual(['Issued', 'Due', 'Quote']);
		expect(d.meta[2]!.value).toBe('Q-2026-0002');
		expect(d.from).toEqual(['Marinković Consulting', 'Bulevar 6', '21000 Novi Sad', 'ivan@example.com']);
		expect(d.to).toEqual([
			'Đorđević i Sinovi d.o.o.',
			'Kneza Miloša 12',
			'11000 Beograd',
			'Tax ID RS108765432',
			'Attn: Ana Čolić',
			'ana@sinovi.rs',
		]);
		expect(d.rows[1]).toEqual(['Support', '3', '€95.00', '10%', '€285.00']);
		expect(d.rows[2]![3]).toBe('–');
		expect(d.totals).toEqual([
			{ label: 'Subtotal', value: '€8,630.50' },
			{ label: 'Tax 10% on €285.00', value: '€28.50' },
			{ label: 'Tax 20% on €8,000.00', value: '€1,600.00' },
			{ label: 'Total due', value: '€10,259.00', strong: true },
		]);
		expect(d.notes).toEqual([
			{ title: 'Payment details', lines: ['IBAN RS35 1600', 'BIC DBDBRSBG', 'Reference: INV-2026-0007'] },
			{ title: '', lines: ['Please pay within 30 days.'] },
		]);
		expect(d.footer).toBe('Marinković Consulting · ivan@example.com');
	});

	it('words quotes differently and works without business details', () => {
		const { index, settings } = setup(NOTES);
		const quote = index.getSnapshot().get('CRM/Quotes/Q-2026-0002.md', 'quote')!;
		const d = invoiceDocument(quote, index.getSnapshot(), settings);
		expect(d.title).toBe('Quote');
		expect(d.meta.map((m) => m.label)).toEqual(['Valid until']);
		expect(d.from).toEqual([]);
		expect(d.totals).toEqual([{ label: 'Total', value: '€0.00', strong: true }]);
		expect(d.notes[0]!.lines[0]).toMatch(/^This quote is valid until /);
	});
});

describe('renderInvoice', () => {
	const pageCount = (bytes: ArrayBuffer) => {
		const text = new TextDecoder('latin1').decode(bytes);
		return Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(text)?.[1]);
	};

	it('produces a PDF, adding pages for long item lists', () => {
		const { index, settings } = setup(NOTES);
		withBusiness(settings);
		const doc = index.getSnapshot().get(INVOICE, 'invoice')!;
		const short = renderInvoice(invoiceDocument(doc, index.getSnapshot(), settings));
		expect(new TextDecoder().decode(short.slice(0, 5))).toBe('%PDF-');
		expect(pageCount(short)).toBe(1);

		const many = { ...doc, items: Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i}`, qty: 1, price: 1, tax: 0 })) };
		expect(pageCount(renderInvoice(invoiceDocument(many, index.getSnapshot(), settings)))).toBe(3);
	});
});

describe('exportBillingPdf', () => {
	it('writes the PDF next to the note and replaces it on re-export', async () => {
		const ctx = setup(NOTES);
		const plugin = { app: ctx.app, settings: ctx.settings, index: ctx.index } as unknown as CrmPlugin;
		const doc = ctx.index.getSnapshot().get(INVOICE, 'invoice')!;

		const file = await exportBillingPdf(plugin, doc);
		expect(file.path).toBe('CRM/Invoices/INV-2026-0007 Đorđević.pdf');
		expect(pdfPathFor(doc)).toBe(file.path);
		const first = ctx.app.vault.binaries.get(file.path)!.data;

		withBusiness(ctx.settings);
		const again = await exportBillingPdf(plugin, doc);
		expect(again).toBe(file);
		expect(ctx.app.vault.binaries.get(file.path)!.data).not.toBe(first);
	});
});
