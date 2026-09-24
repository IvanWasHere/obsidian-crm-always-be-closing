import type { CrmSettings } from '../settings';
import type { CrmSnapshot } from './CrmSnapshot';
import type { DateString, Invoice, LineItem, Quote, StageChange, Totals } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

function toNumber(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value !== 'string' || value.trim() === '') return undefined;
	const n = Number(value.replace(/[\s_]/g, '').replace(',', '.'));
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Reads `items` from frontmatter. Each item needs a description or a price;
 * `qty` defaults to 1 and `tax` to 0. Returns the items and how many were unreadable.
 */
export function parseLineItems(value: unknown): { items: LineItem[]; invalid: number } {
	if (!Array.isArray(value)) return { items: [], invalid: value === undefined || value === null ? 0 : 1 };
	const items: LineItem[] = [];
	let invalid = 0;
	for (const raw of value) {
		if (!raw || typeof raw !== 'object') {
			invalid++;
			continue;
		}
		const r = raw as Record<string, unknown>;
		const description = typeof r.description === 'string' ? r.description.trim() : '';
		const price = toNumber(r.price);
		if (!description && price === undefined) {
			invalid++;
			continue;
		}
		items.push({ description, qty: toNumber(r.qty) ?? 1, price: price ?? 0, tax: toNumber(r.tax) ?? 0 });
	}
	return { items, invalid };
}

/**
 * Net, tax and gross of line items, rounded to cents. Tax is worked out per
 * rate on the summed base (as on VAT invoices), so it always equals the sum
 * of the per-rate lines printed by taxBreakdown.
 */
export function totalsOf(items: readonly LineItem[]): Totals {
	const net = round2(items.reduce((sum, i) => sum + i.qty * i.price, 0));
	const tax = round2(taxBreakdown(items).reduce((sum, t) => sum + t.tax, 0));
	return { net, tax, gross: round2(net + tax) };
}

/** An invoice that was sent and is past its due date (and not paid or void). */
export function isOverdue(invoice: Invoice, today: DateString): boolean {
	return invoice.status === 'sent' && invoice.due !== undefined && invoice.due < today;
}

/** A quote or invoice that has gone out: anything but a draft (or a void invoice). */
export function wasSent(doc: Quote | Invoice): boolean {
	return doc.status !== 'draft' && doc.status !== 'void';
}

/** The next free number for this year, e.g. `INV-2026-0008` after `INV-2026-0007`. */
export function nextNumber(crm: CrmSnapshot, type: 'quote' | 'invoice', settings: CrmSettings, today: DateString): string {
	const prefix = type === 'invoice' ? settings.billing.invoicePrefix : settings.billing.quotePrefix;
	const year = today.slice(0, 4);
	const pattern = new RegExp(`^${escapeRegExp(prefix)}${year}-(\\d+)$`);
	let max = 0;
	for (const doc of crm.all(type)) {
		const match = doc.number ? pattern.exec(doc.number) : null;
		if (match) max = Math.max(max, Number(match[1]));
	}
	return `${prefix}${year}-${String(max + 1).padStart(4, '0')}`;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parses `stage_history` entries like `"2026-09-20 lead"`. Invalid entries are dropped. */
export function parseStageHistory(value: unknown): StageChange[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => (typeof entry === 'string' ? /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(entry.trim()) : null))
		.filter((m): m is RegExpExecArray => m !== null)
		.map((m) => ({ date: m[1]!, stage: m[2]!.trim() }))
		.sort((a, b) => a.date.localeCompare(b.date));
}

export function formatStageChange(change: StageChange): string {
	return `${change.date} ${change.stage}`;
}

/** Tax per rate, e.g. 19% on 12,000 → 2,280. Rates of 0 are left out. Sorted by rate. */
export function taxBreakdown(items: readonly LineItem[]): { rate: number; base: number; tax: number }[] {
	const byRate = new Map<number, number>();
	for (const item of items) {
		if (!item.tax) continue;
		byRate.set(item.tax, (byRate.get(item.tax) ?? 0) + item.qty * item.price);
	}
	return [...byRate.entries()]
		.sort(([a], [b]) => a - b)
		.map(([rate, base]) => ({ rate, base: round2(base), tax: round2((base * rate) / 100) }));
}
