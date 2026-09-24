import { describe, expect, it } from 'vitest';
import { formatMoney, formatTotals, relativeDay } from '../src/ui/format';

describe('format', () => {
	it('describes days relative to today', () => {
		expect(relativeDay('2026-09-25', '2026-09-25')).toBe('today');
		expect(relativeDay('2026-09-26', '2026-09-25')).toBe('tomorrow');
		expect(relativeDay('2026-09-24', '2026-09-25')).toBe('yesterday');
		expect(relativeDay('2026-10-02', '2026-09-25')).toBe('in 7 days');
		expect(relativeDay('2026-09-20', '2026-09-25')).toBe('5 days ago');
	});

	it('formats money and falls back for invalid currency codes', () => {
		expect(formatMoney(12000, 'EUR')).toMatch(/12,000/);
		expect(formatMoney(12000, 'EURO')).toBe('12,000 EURO');
		expect(formatTotals({ USD: 5, EUR: 10 })).toMatch(/10.*·.*5/);
		expect(formatTotals({})).toBe('');
	});
});
