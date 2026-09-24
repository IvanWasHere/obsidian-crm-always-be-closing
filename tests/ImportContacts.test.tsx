import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportContacts } from '../src/ui/views/ImportContacts';
import { renderWithCrm } from './fixtures';

const CSV = 'First Name,Last Name,Email Address,Company\nAda,Lovelace,ada@engine.org,Analytical Engines\nJane,Doe,jane@acme.com,Acme Inc\n';

function pickFile(text: string) {
	const file = new File([text], 'contacts.csv', { type: 'text/csv' });
	fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
}

describe('ImportContacts', () => {
	it('maps columns, summarises and imports', async () => {
		const onDone = vi.fn();
		const ctx = renderWithCrm(<ImportContacts onDone={onDone} />);
		pickFile(CSV);

		expect(await screen.findByRole('status')).toHaveTextContent(
			'Will create 1 contact. 1 already exist and will be skipped.',
		);
		expect(screen.getByLabelText('First name')).toHaveDisplayValue('First Name');
		expect(screen.getByLabelText('Email')).toHaveDisplayValue('Email Address');
		expect(screen.getByLabelText('Create 1 new company')).toBeChecked();

		fireEvent.click(screen.getByRole('button', { name: 'Import' }));
		await waitFor(() => expect(onDone).toHaveBeenCalled());
		expect(ctx.app.vault.readNote('CRM/Contacts/Ada Lovelace.md')?.frontmatter?.company).toBe('[[Analytical Engines]]');
		expect(ctx.app.vault.readNote('CRM/Companies/Analytical Engines.md')).toBeDefined();
	});

	it('asks for a name column when none is mapped', async () => {
		renderWithCrm(<ImportContacts onDone={() => {}} />);
		pickFile('Foo,Email\nx,a@b.c\n');
		expect(await screen.findByRole('status')).toHaveTextContent('Map a name column');
		expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

		fireEvent.change(screen.getByLabelText('Name'), { target: { value: '0' } });
		expect(screen.getByRole('status')).toHaveTextContent('Will create 1 contact.');
	});

	it('reports an empty file', async () => {
		renderWithCrm(<ImportContacts onDone={() => {}} />);
		pickFile('');
		expect(await screen.findByRole('alert')).toHaveTextContent('That file has no rows to import.');
	});
});
