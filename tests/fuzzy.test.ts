import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyScore } from '../src/utils/fuzzy';

describe('fuzzy', () => {
	it('matches substrings and scattered letters', () => {
		expect(fuzzyScore('doe', 'Jane Doe')).not.toBeNull();
		expect(fuzzyScore('jd', 'Jane Doe')).not.toBeNull();
		expect(fuzzyScore('xyz', 'Jane Doe')).toBeNull();
	});

	it('ranks word starts and substrings first', () => {
		const names = ['Adam Smith', 'Jane Smithers', 'Samuel Mitchell'];
		expect(fuzzyFilter('smi', names, (n) => n)).toEqual(['Adam Smith', 'Jane Smithers', 'Samuel Mitchell']);
		expect(fuzzyFilter('', names, (n) => n, 2)).toEqual(['Adam Smith', 'Jane Smithers']);
	});
});
