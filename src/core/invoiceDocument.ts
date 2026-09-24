import type { CrmSettings } from '../settings';
import type { CrmSnapshot } from './CrmSnapshot';
import { taxBreakdown } from './billing';
import type { DateString, Invoice, Quote } from './types';

/**
 * Everything printed on an invoice or quote PDF, already formatted as text.
 * Kept separate from drawing so it can be tested without a PDF library.
 */
export interface InvoiceDocument {
	title: string;
	number: string;
	/** Right-hand header rows, e.g. Issued / Due. */
	meta: { label: string; value: string }[];
	/** Sender: business name first. */
	from: string[];
	/** Recipient: company (or contact) name first. */
	to: string[];
	columns: string[];
	/** One row per line item, in column order. */
	rows: string[][];
	totals: { label: string; value: string; strong?: boolean }[];
	notes: { title: string; lines: string[] }[];
	footer: string;
}

const lines = (text: string | undefined) =>
	(text ?? '')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

/** Money with cents in the user's locale; `12000 XYZ` for unknown codes. */
export function formatAmount(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);
	} catch {
		return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
	}
}

function formatDay(date: DateString | undefined): string | undefined {
	if (!date) return undefined;
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

const formatQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const formatRate = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export function invoiceDocument(doc: Quote | Invoice, crm: CrmSnapshot, settings: CrmSettings): InvoiceDocument {
	const b = settings.billing;
	const currency = doc.currency ?? settings.defaultCurrency;
	const money = (n: number) => formatAmount(n, currency);
	const company = crm.companyOf(doc.path);
	const contact = crm.contactsOf(doc.path)[0];

	const meta: InvoiceDocument['meta'] = [];
	const add = (label: string, value: string | undefined) => {
		if (value) meta.push({ label, value });
	};
	add('Issued', formatDay(doc.issued));
	if (doc.type === 'invoice') {
		add('Due', formatDay(doc.due));
		add('Quote', crm.quoteOf(doc.path)?.name);
		if (doc.status === 'paid') add('Paid', formatDay(doc.paidOn) ?? 'Yes');
	} else {
		add('Valid until', formatDay(doc.validUntil));
	}

	const from = [
		b.businessName,
		...lines(b.businessAddress),
		b.businessEmail,
		b.businessPhone,
		b.businessTaxId && `Tax ID ${b.businessTaxId}`,
	].filter((l): l is string => Boolean(l));

	// Unresolved company links still carry a name worth printing.
	const companyName = company?.name ?? doc.company?.linkpath;
	const to = [
		companyName ?? contact?.name ?? '',
		...lines(company?.address),
		company?.taxId && `Tax ID ${company.taxId}`,
		companyName && contact && `Attn: ${contact.name}`,
		contact?.email,
	].filter((l): l is string => Boolean(l));

	const rows = doc.items.map((i) => [
		i.description,
		formatQty(i.qty),
		money(i.price),
		i.tax ? formatRate(i.tax) : '–',
		money(i.qty * i.price),
	]);

	const totals: InvoiceDocument['totals'] = [];
	if (doc.items.length > 0) {
		totals.push({ label: 'Subtotal', value: money(doc.totals.net) });
		for (const t of taxBreakdown(doc.items)) {
			totals.push({ label: `Tax ${formatRate(t.rate)} on ${money(t.base)}`, value: money(t.tax) });
		}
	}
	totals.push({ label: doc.type === 'invoice' ? 'Total due' : 'Total', value: money(doc.totals.gross), strong: true });

	const notes: InvoiceDocument['notes'] = [];
	if (doc.type === 'invoice') {
		const payment = lines(b.bankDetails);
		if (doc.number) payment.push(`Reference: ${doc.number}`);
		if (b.bankDetails) notes.push({ title: 'Payment details', lines: payment });
		if (b.paymentNote) notes.push({ title: '', lines: lines(b.paymentNote) });
	} else if (doc.validUntil) {
		notes.push({ title: '', lines: [`This quote is valid until ${formatDay(doc.validUntil)}.`] });
	}

	return {
		title: doc.type === 'invoice' ? 'Invoice' : 'Quote',
		number: doc.number ?? doc.name,
		meta,
		from,
		to,
		columns: ['Description', 'Qty', 'Unit price', 'Tax', 'Amount'],
		rows,
		totals,
		notes,
		footer: [b.businessName, b.businessEmail].filter(Boolean).join(' · '),
	};
}
