import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardView } from '../src/ui/views/DashboardView';
import { SEED, renderWithCrm } from './fixtures';

// Pin "today" so the seed dates land in predictable buckets.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const section = (name: string) => screen.getByRole('region', { name });

describe('DashboardView', () => {
	it('shows stats for the seed data', () => {
		renderWithCrm(<DashboardView />);
		expect(screen.getByTestId('stat-contacts')).toHaveTextContent('3');
		expect(screen.getByTestId('stat-companies')).toHaveTextContent('2');
		expect(screen.getByTestId('stat-open-projects')).toHaveTextContent('2');
		expect(screen.getByTestId('stat-pipeline')).toHaveTextContent(/12,000/);
	});

	it('lists follow-ups, stale contacts and projects closing soon', () => {
		renderWithCrm(<DashboardView />, {
			...SEED,
			'CRM/Contacts/Ann.md': { type: 'crm-contact', last_contacted: '2026-09-24', next_follow_up: '2026-09-25' },
			'CRM/Contacts/Bo.md': { type: 'crm-contact', last_contacted: '2026-07-01' },
			'CRM/Projects/Soon.md': { type: 'crm-project', stage: 'proposal', expected_close: '2026-10-10', value: 500 },
		});

		const followUps = section('Follow-ups');
		// John Smith's follow-up (2026-09-15) is overdue but he's cold, not archived, so it still shows.
		expect(within(within(followUps).getByLabelText('Overdue')).getByText('John Smith')).toBeInTheDocument();
		expect(within(within(followUps).getByLabelText('Today')).getByText('Ann')).toBeInTheDocument();
		const thisWeek = within(within(followUps).getByLabelText('This week'));
		expect(thisWeek.getByText('Jane Doe')).toBeInTheDocument();
		expect(thisWeek.getByText('in 6 days')).toBeInTheDocument();

		const stale = section('No contact in 30+ days');
		expect(within(stale).getByText('Bo')).toBeInTheDocument();
		expect(within(stale).getByText('last contacted 86 days ago')).toBeInTheDocument();

		const closing = section('Closing soon');
		expect(within(closing).getByText('Soon')).toBeInTheDocument();
		expect(within(closing).getByText('closes in 15 days')).toBeInTheDocument();
	});

	it('snoozes and completes follow-ups', async () => {
		const ctx = renderWithCrm(<DashboardView />);
		const john = within(section('Follow-ups')).getByText('John Smith').closest('li')!;

		fireEvent.click(within(john).getByRole('button', { name: 'Snooze 1 week' }));
		await waitFor(() =>
			expect(ctx.app.vault.readNote('CRM/Contacts/John Smith.md')?.frontmatter?.next_follow_up).toBe('2026-10-02'),
		);
		act(() => ctx.index.flush());
		const moved = within(section('Follow-ups')).getByText('John Smith').closest('li')!;
		expect(within(moved).getByText('in 7 days')).toBeInTheDocument();

		fireEvent.click(within(moved).getByRole('button', { name: 'Done' }));
		await waitFor(() =>
			expect(ctx.app.vault.readNote('CRM/Contacts/John Smith.md')?.frontmatter).not.toHaveProperty('next_follow_up'),
		);
	});
});
