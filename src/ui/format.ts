import { daysBetween } from '../core/dates';

/** `€12,000`-style amounts in the user's locale; falls back to `12000 XYZ` for unknown currency codes. */
export function formatMoney(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
	} catch {
		return `${value.toLocaleString()} ${currency}`;
	}
}

/** Per-currency totals joined for display, e.g. `€62,000 · $5,000`. Empty string if there are none. */
export function formatTotals(totals: Record<string, number>): string {
	return Object.entries(totals)
		.sort(([, a], [, b]) => b - a)
		.map(([currency, value]) => formatMoney(value, currency))
		.join(' · ');
}

/** `today`, `tomorrow`, `in 3 days`, `2 days ago`… relative to `today`. */
export function relativeDay(date: string, today: string): string {
	const days = daysBetween(today, date);
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
