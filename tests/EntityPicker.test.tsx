import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntityPicker } from '../src/ui/components/EntityPicker';
import { renderWithCrm } from './fixtures';

function Harness({ multiple, onChange }: { multiple?: boolean; onChange: (v: string[]) => void }) {
	const [value, setValue] = useState<string[]>([]);
	return (
		<EntityPicker
			type="contact"
			multiple={multiple}
			value={value}
			onChange={(v) => {
				setValue(v);
				onChange(v);
			}}
		/>
	);
}

describe('EntityPicker', () => {
	it('filters by fuzzy search and picks with the keyboard', () => {
		const onChange = vi.fn();
		renderWithCrm(<Harness multiple onChange={onChange} />);
		const input = screen.getByRole('combobox');

		fireEvent.change(input, { target: { value: 'mar' } });
		expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Maria Garcia']);
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(onChange).toHaveBeenLastCalledWith(['CRM/Contacts/Maria Garcia.md']);
		expect(screen.getByText('Maria Garcia')).toHaveClass('abc-chip');

		// Already-picked entities are not suggested again.
		fireEvent.focus(input);
		expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Jane Doe', 'John Smith']);
		fireEvent.keyDown(input, { key: 'ArrowDown' });
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(onChange).toHaveBeenLastCalledWith(['CRM/Contacts/Maria Garcia.md', 'CRM/Contacts/John Smith.md']);

		fireEvent.keyDown(input, { key: 'Backspace' });
		expect(onChange).toHaveBeenLastCalledWith(['CRM/Contacts/Maria Garcia.md']);
	});

	it('single mode hides the input once something is picked', () => {
		const onChange = vi.fn();
		renderWithCrm(<Harness onChange={onChange} />);
		fireEvent.focus(screen.getByRole('combobox'));
		fireEvent.mouseDown(screen.getByRole('option', { name: 'Jane Doe' }));
		expect(onChange).toHaveBeenLastCalledWith(['CRM/Contacts/Jane Doe.md']);
		expect(screen.queryByRole('combobox')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Remove Jane Doe' }));
		expect(onChange).toHaveBeenLastCalledWith([]);
		expect(screen.getByRole('combobox')).toBeInTheDocument();
	});
});
