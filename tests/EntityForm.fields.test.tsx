import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityForm } from '../src/ui/components/EntityForm';
import { renderWithCrm } from './fixtures';

describe('EntityForm fields', () => {
	it('shows only the requested fields', () => {
		renderWithCrm(<EntityForm type="interaction" fields={['kind', 'summary']} submitLabel="Log" onSubmit={async () => {}} />);
		expect(screen.getByLabelText('Kind')).toBeInTheDocument();
		expect(screen.getByLabelText('Summary')).toBeInTheDocument();
		expect(screen.queryByLabelText('Date')).toBeNull();
		expect(screen.queryByLabelText('Contacts')).toBeNull();
	});

	it('includes custom fields, with select options', () => {
		renderWithCrm(<EntityForm type="deal" submitLabel="Create" onSubmit={async () => {}} />, undefined, {
			customFields: {
				contact: [],
				company: [],
				deal: [{ key: 'source', label: 'Source', kind: 'select', options: ['Referral', 'Inbound'] }],
				interaction: [],
				quote: [],
				invoice: [],
			},
		});
		expect([...screen.getByLabelText('Source').querySelectorAll('option')].map((o) => o.textContent)).toEqual([
			'—',
			'Referral',
			'Inbound',
		]);
	});
});
