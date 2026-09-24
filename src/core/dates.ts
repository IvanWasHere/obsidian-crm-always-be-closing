import type { DateString } from './types';

/** Adds whole days to a `YYYY-MM-DD` date (calendar math in UTC, so DST can't shift it). */
export function addDays(date: DateString, days: number): DateString {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: DateString, to: DateString): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
