import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContactsView } from '../src/ui/views/ContactsView';
import { SEED, renderWithCrm } from './fixtures';

const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent);

describe('ContactsView', () => {
	it('lists contacts sorted by name with company and status', () => {
		renderWithCrm(<ContactsView />);
		expect(names()).toEqual(['Jane Doe', 'John Smith', 'Maria Garcia']);
		expect(screen.getByText('3 contacts')).toBeInTheDocument();
		const jane = screen.getAllByRole('row')[1]!;
		expect(within(jane).getByText('Acme Inc')).toHaveClass('internal-link');
		expect(within(jane).getByText('active')).toHaveClass('abc-status-active');
	});

	it('searches across name, company and tags', () => {
		renderWithCrm(<ContactsView />);
		const search = screen.getByRole('searchbox', { name: 'Search contacts' });
		fireEvent.change(search, { target: { value: 'globex' } });
		expect(names()).toEqual(['John Smith']);
		fireEvent.change(search, { target: { value: 'nobody' } });
		expect(screen.getByText('No contacts match the current filters.')).toBeInTheDocument();
	});

	it('filters by status and hides archived contacts by default', () => {
		renderWithCrm(<ContactsView />, {
			...SEED,
			'CRM/Contacts/Old Friend.md': { type: 'crm-contact', status: 'archived' },
		});
		expect(names()).not.toContain('Old Friend');
		fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'archived' } });
		expect(names()).toEqual(['Old Friend']);
		fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'cold' } });
		expect(names()).toEqual(['John Smith']);
	});

	it('sorts by column, with empty values last', () => {
		renderWithCrm(<ContactsView />);
		fireEvent.click(screen.getByRole('button', { name: 'Next follow-up' }));
		// John 2026-09-15, Jane 2026-10-01, Maria has none.
		expect(names()).toEqual(['John Smith', 'Jane Doe', 'Maria Garcia']);
		fireEvent.click(screen.getByRole('button', { name: /Next follow-up/ }));
		expect(names()).toEqual(['Jane Doe', 'John Smith', 'Maria Garcia']);
	});

	it('opens notes on click, in a new tab with Cmd/Ctrl', () => {
		const { app } = renderWithCrm(<ContactsView />);
		fireEvent.click(screen.getByText('Maria Garcia'));
		fireEvent.click(screen.getAllByText('Acme Inc')[0]!, { metaKey: true });
		expect(app.workspace.opened).toEqual([
			{ path: 'CRM/Contacts/Maria Garcia.md', newLeaf: false },
			{ path: 'CRM/Companies/Acme Inc.md', newLeaf: 'tab' },
		]);
	});

	it('flags overdue follow-ups', () => {
		renderWithCrm(<ContactsView />, {
			'CRM/Contacts/Late.md': { type: 'crm-contact', next_follow_up: '2000-01-01' },
		});
		expect(screen.getByText('2000-01-01')).toHaveClass('abc-overdue');
	});

	it('shows custom fields marked "show in table" as sortable columns', () => {
		renderWithCrm(
			<ContactsView />,
			{
				...SEED,
				'CRM/Contacts/Jane Doe.md': { ...SEED['CRM/Contacts/Jane Doe.md'], score: 7 },
				'CRM/Contacts/John Smith.md': { ...SEED['CRM/Contacts/John Smith.md'], score: 12 },
			},
			{
				customFields: {
					contact: [
						{ key: 'score', label: 'Score', kind: 'number', showInTable: true },
						{ key: 'hidden', label: 'Hidden', kind: 'text' },
					],
					company: [],
					project: [],
					interaction: [],
					quote: [],
					invoice: [],
					requirement: [],
				},
			},
		);
		expect(screen.getByRole('button', { name: 'Score' })).toBeInTheDocument();
		expect(screen.queryByRole('columnheader', { name: 'Hidden' })).toBeNull();

		// Numeric sort (7 before 12), empty last.
		fireEvent.click(screen.getByRole('button', { name: 'Score' }));
		expect(names()).toEqual(['Jane Doe', 'John Smith', 'Maria Garcia']);
		fireEvent.click(screen.getByRole('button', { name: /Score/ }));
		expect(names()).toEqual(['John Smith', 'Jane Doe', 'Maria Garcia']);
	});
});
