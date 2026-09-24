import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../src/utils/csv';

describe('csv', () => {
	it('parses quotes, escaped quotes, newlines, CRLF and BOM', () => {
		const text = '\uFEFFname,notes\r\n"Doe, Jane","said ""hi""\nthen left"\r\nJohn,\r\n\r\n';
		expect(parseCsv(text)).toEqual([
			['name', 'notes'],
			['Doe, Jane', 'said "hi"\nthen left'],
			['John', ''],
		]);
	});

	it('detects semicolon and tab delimiters', () => {
		expect(parseCsv('a;b\n1;2')).toEqual([
			['a', 'b'],
			['1', '2'],
		]);
		expect(parseCsv('a\tb\n1\t2')).toEqual([
			['a', 'b'],
			['1', '2'],
		]);
	});

	it('round-trips through toCsv', () => {
		const rows = [
			['name', 'notes'],
			['Doe, Jane', 'said "hi"\nbye'],
			[' padded ', 'plain'],
		];
		const csv = toCsv(rows);
		expect(csv).toBe('name,notes\r\n"Doe, Jane","said ""hi""\nbye"\r\n" padded ",plain\r\n');
		expect(parseCsv(csv)).toEqual(rows);
	});
});
