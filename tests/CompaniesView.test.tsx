import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompaniesView } from '../src/ui/views/CompaniesView';
import { SEED, renderWithCrm } from './fixtures';

const rows = () =>
	screen
		.getAllByRole('row')
		.slice(1)
		.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));

describe('CompaniesView', () => {
	it('rolls up contacts, open deals, pipeline and last interaction', () => {
		renderWithCrm(<CompaniesView />);
		const [acme, globex] = rows();
		expect(acme!.slice(0, 4)).toEqual(['Acme Inc', '', '2', '1']);
		expect(acme![4]).toMatch(/12,000/);
		expect(acme![5]).toBe('2026-09-20');
		expect(globex!.slice(0, 4)).toEqual(['Globex', '', '1', '1']);
		expect(globex![5]).toBe('');
	});

	it('leaves closed deals out of the rollup', () => {
		renderWithCrm(<CompaniesView />, {
			...SEED,
			'CRM/Deals/Acme - Old.md': { type: 'crm-deal', company: '[[Acme Inc]]', stage: 'won', value: 99 },
		});
		expect(rows()[0]!.slice(0, 4)).toEqual(['Acme Inc', '', '2', '1']);
	});

	it('searches and sorts', () => {
		renderWithCrm(<CompaniesView />);
		fireEvent.click(screen.getByRole('button', { name: 'Contacts' }));
		expect(rows().map((r) => r[0])).toEqual(['Globex', 'Acme Inc']);
		fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'prospect' } });
		expect(rows().map((r) => r[0])).toEqual(['Globex']);
	});
});
