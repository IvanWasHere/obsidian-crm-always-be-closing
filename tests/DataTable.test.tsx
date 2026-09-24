import { describe, expect, it } from 'vitest';
import { sortRows, type Column } from '../src/ui/components/DataTable';

const col: Column<{ v?: string | number }> = { id: 'v', header: 'V', render: () => null, sortValue: (r) => r.v };

describe('sortRows', () => {
	it('sorts strings and numbers, keeping empty values last in both directions', () => {
		const rows = [{ v: 'b' }, {}, { v: 'a' }, { v: '' }];
		expect(sortRows(rows, col, false).map((r) => r.v)).toEqual(['a', 'b', undefined, '']);
		expect(sortRows(rows, col, true).map((r) => r.v)).toEqual(['b', 'a', undefined, '']);
		expect(sortRows([{ v: 10 }, { v: 9 }], col, false).map((r) => r.v)).toEqual([9, 10]);
	});
});
