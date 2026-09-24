import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityPanel } from '../src/ui/views/EntityPanel';
import { SEED, renderWithCrm } from './fixtures';

const JANE = 'CRM/Contacts/Jane Doe.md';

function open(ctx: ReturnType<typeof renderWithCrm>, path: string) {
	act(() => {
		ctx.app.workspace.setActiveFile(ctx.app.vault.file(path));
	});
}

describe('EntityPanel', () => {
	it('shows a hint when the active note is not a CRM note', () => {
		renderWithCrm(<EntityPanel />);
		expect(screen.getByText(/Open a CRM note/)).toBeInTheDocument();
	});

	it('shows a contact with its fields, deals and interactions', () => {
		const ctx = renderWithCrm(<EntityPanel />);
		open(ctx, JANE);

		expect(screen.getByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
		expect(screen.getByLabelText('Status')).toHaveValue('active');
		expect(screen.getByLabelText('Next follow-up')).toHaveValue('2026-10-01');
		expect(screen.getByText('Acme Inc')).toHaveClass('abc-chip');

		const deals = screen.getByRole('heading', { name: /Deals/ }).closest('section')!;
		expect(within(deals).getByText('Acme – Pilot')).toBeInTheDocument();
		const timeline = screen.getByRole('heading', { name: /Interactions/ }).closest('section')!;
		expect(within(timeline).getByText('2026-09-20 Call with Jane Doe')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Log interaction/ })).toBeInTheDocument();
	});

	it('follows the active note', () => {
		const ctx = renderWithCrm(<EntityPanel />);
		open(ctx, JANE);
		open(ctx, 'CRM/Companies/Acme Inc.md');
		expect(screen.getByRole('heading', { name: 'Acme Inc' })).toBeInTheDocument();
		const contacts = screen.getByRole('heading', { name: /Contacts/ }).closest('section')!;
		expect(within(contacts).getAllByRole('link').map((a) => a.textContent)).toEqual(['Jane Doe', 'Maria Garcia']);
	});

	it('saves text fields on blur and selects immediately', async () => {
		const ctx = renderWithCrm(<EntityPanel />);
		open(ctx, JANE);

		const role = screen.getByLabelText('Role');
		fireEvent.change(role, { target: { value: 'COO' } });
		expect(ctx.app.vault.readNote(JANE)?.frontmatter?.role).toBeUndefined();
		fireEvent.blur(role);
		await waitFor(() => expect(ctx.app.vault.readNote(JANE)?.frontmatter?.role).toBe('COO'));

		fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cold' } });
		await waitFor(() => expect(ctx.app.vault.readNote(JANE)?.frontmatter?.status).toBe('cold'));

		act(() => ctx.index.flush());
		expect(screen.getByLabelText('Role')).toHaveValue('COO');
	});

	it('lists parse problems and unresolved links', () => {
		const ctx = renderWithCrm(<EntityPanel />, {
			...SEED,
			'CRM/Contacts/Bad.md': { type: 'crm-contact', status: 'hot', company: '[[Nowhere]]' },
		});
		open(ctx, 'CRM/Contacts/Bad.md');
		expect(screen.getByText('status "hot" should be one of: active, cold, archived')).toBeInTheDocument();
		expect(screen.getByText('Not a CRM note: [[Nowhere]] (replaced if you pick one)')).toBeInTheDocument();
	});

	it('keeps links to non-CRM notes when editing a multi-link field', async () => {
		const ctx = renderWithCrm(<EntityPanel />, {
			...SEED,
			'CRM/Deals/Mixed.md': { type: 'crm-deal', stage: 'lead', contacts: ['[[Jane Doe]]', '[[Someone Else]]'] },
		});
		open(ctx, 'CRM/Deals/Mixed.md');
		expect(screen.getByText(/\[\[Someone Else\]\] \(kept when you edit this field\)/)).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Remove Jane Doe' }));
		await waitFor(() =>
			expect(ctx.app.vault.readNote('CRM/Deals/Mixed.md')?.frontmatter?.contacts).toEqual(['[[Someone Else]]']),
		);
	});

	it('shows and edits custom fields', async () => {
		const ctx = renderWithCrm(<EntityPanel />, {
			...SEED,
			'CRM/Contacts/Jane Doe.md': { ...SEED['CRM/Contacts/Jane Doe.md'], linkedin: 'https://linkedin.com/in/jane', vip: true },
		});
		ctx.settings.customFields.contact.push(
			{ key: 'linkedin', label: 'LinkedIn', kind: 'url' },
			{ key: 'vip', label: 'VIP', kind: 'checkbox' },
		);
		open(ctx, JANE);
		expect(screen.getByLabelText('LinkedIn')).toHaveValue('https://linkedin.com/in/jane');
		expect(screen.getByLabelText('VIP')).toBeChecked();

		fireEvent.click(screen.getByLabelText('VIP'));
		await waitFor(() => expect(ctx.app.vault.readNote(JANE)?.frontmatter).not.toHaveProperty('vip'));
	});
});
