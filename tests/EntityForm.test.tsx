import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIELDS } from '../src/core/fields';
import { EntityForm, validate } from '../src/ui/components/EntityForm';
import { renderWithCrm } from './fixtures';

describe('validate', () => {
	it('checks required and numeric fields', () => {
		expect(validate(FIELDS.deal, {})).toBe('Name is required.');
		expect(validate(FIELDS.deal, { name: 'X', value: 'abc' })).toBe('Value should be a number.');
		expect(validate(FIELDS.deal, { name: 'X', probability: '40' })).toBe('Probability should be between 0 and 1.');
		expect(validate(FIELDS.deal, { name: 'X', value: '12,000', probability: '0.4' })).toBeNull();
	});
});

describe('EntityForm', () => {
	it('submits the entered values and body', async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderWithCrm(
			<EntityForm type="deal" initial={{ company: ['CRM/Companies/Acme Inc.md'] }} submitLabel="Create" bodyLabel="Notes" onSubmit={onSubmit} />,
		);
		expect(screen.getByText('Acme Inc')).toHaveClass('abc-chip');

		fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Acme – Renewal' } });
		fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'proposal' } });
		fireEvent.change(screen.getByLabelText('Value'), { target: { value: '9000' } });
		fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Renewal talk' } });
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit).toHaveBeenCalledWith(
			{ company: ['CRM/Companies/Acme Inc.md'], name: 'Acme – Renewal', stage: 'proposal', value: '9000' },
			'Renewal talk',
		);
	});

	it('shows validation and submit errors', async () => {
		const onSubmit = vi.fn().mockRejectedValue(new Error('Disk full'));
		renderWithCrm(<EntityForm type="company" submitLabel="Create" onSubmit={onSubmit} />);

		fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Initech' } });
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		expect(await screen.findByText('Disk full')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
	});
});
