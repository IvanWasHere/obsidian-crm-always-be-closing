import type { ReactNode } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from '../src/ui/views/CalendarView';
import { DashboardView } from '../src/ui/views/DashboardView';
import { SEED, renderWithCrm } from './fixtures';

const modalsOpened = vi.hoisted(() => [] as { title: string; render: (close: () => void) => ReactNode }[]);
vi.mock('../src/obsidian/ReactModal', () => ({
	ReactModal: class {
		constructor(_plugin: unknown, title: string, render: (close: () => void) => ReactNode) {
			modalsOpened.push({ title, render });
		}
		open() {}
	},
}));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const NOTES = {
	...SEED,
	'CRM/Interactions/Review.md': {
		type: 'crm-interaction',
		kind: 'meeting',
		date: '2026-09-29',
		time: '14:30',
		duration: 60,
		contacts: ['[[Jane Doe]]'],
		summary: 'Pilot review',
	},
	'CRM/Interactions/Overlap.md': {
		type: 'crm-interaction',
		kind: 'meeting',
		date: '2026-09-29',
		time: '15:00',
		summary: 'Budget sync',
	},
	'CRM/Interactions/Next month.md': { type: 'crm-interaction', kind: 'meeting', date: '2026-10-20', summary: 'Kickoff' },
};

const cell = (label: RegExp) => screen.getByRole('gridcell', { name: label });

describe('CalendarView', () => {
	it('shows events in month cells and marks today', () => {
		renderWithCrm(<CalendarView />, NOTES);
		expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
		expect(within(cell(/September 29/)).getByText('Pilot review')).toBeInTheDocument();
		expect(within(cell(/September 15/)).getByText('Follow up: John Smith')).toBeInTheDocument();
		expect(within(cell(/September 15/)).getByText('(overdue)')).toBeInTheDocument();
		expect(cell(/September 25/)).toHaveClass('is-today');
		// Oct 20 is outside the six-week grid of September.
		expect(screen.queryByText('Kickoff')).toBeNull();
	});

	it('toggles categories and navigates months', () => {
		renderWithCrm(<CalendarView />, NOTES);
		fireEvent.click(screen.getByRole('button', { name: 'Follow-ups' }));
		expect(screen.getByRole('button', { name: 'Follow-ups' })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByText('Follow up: John Smith')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
		expect(within(cell(/October 20/)).getByText('Kickoff')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Today' }));
		expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
	});

	it('lays out a week with timed meetings side by side and all-day items above', () => {
		renderWithCrm(<CalendarView />, NOTES);
		fireEvent.click(screen.getByRole('radio', { name: 'Week' }));
		expect(screen.getByRole('heading', { name: /Sep 21\s?–\s?27, 2026/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(screen.getByRole('heading', { name: /Sep 28\s?–\s?Oct 4, 2026/ })).toBeInTheDocument();
		const review = screen.getByText('Pilot review').closest<HTMLElement>('.abc-week-event')!;
		const budget = screen.getByText('Budget sync').closest<HTMLElement>('.abc-week-event')!;
		expect(review.style.width).toBe('calc(50% - 4px)');
		expect(budget.style.left).toBe('calc(50% + 2px)');
		// 14:30 with the grid starting at 08:00: 6.5 hours × 44px.
		expect(review.style.top).toBe('286px');
		expect(screen.getByText('Follow up: Jane Doe').closest('.abc-week-allday-cell')).not.toBeNull();
	});

	it('lists the next 30 days in the agenda and opens notes', () => {
		const ctx = renderWithCrm(<CalendarView />, NOTES);
		fireEvent.click(screen.getByRole('radio', { name: 'Agenda' }));
		const days = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
		expect(days[0]).toMatch(/September 29/);
		expect(days).toContainEqual(expect.stringMatching(/October 20/));
		fireEvent.click(screen.getByText('Pilot review'));
		expect(ctx.app.workspace.opened).toEqual([{ path: 'CRM/Interactions/Review.md', newLeaf: false }]);
	});

	it('schedules a meeting on a chosen day', async () => {
		const ctx = renderWithCrm(<CalendarView />, NOTES);
		fireEvent.click(screen.getByRole('button', { name: 'Schedule on October 2' }));
		const opened = modalsOpened[modalsOpened.length - 1]!;
		expect(opened.title).toBe('Schedule meeting');

		ctx.rerender(<>{opened.render(() => {})}</>);
		expect(screen.getByLabelText('Date')).toHaveValue('2026-10-02');
		expect(screen.getByLabelText('Time')).toHaveValue('13:00');
		fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Demo' } });
		fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
		await waitFor(() => expect(ctx.app.vault.readNote('CRM/Interactions/2026-10-02 Meeting.md')).toBeDefined());
		expect(ctx.app.vault.readNote('CRM/Interactions/2026-10-02 Meeting.md')?.frontmatter).toMatchObject({
			kind: 'meeting',
			date: '2026-10-02',
			time: '13:00',
			duration: 30,
			summary: 'Demo',
		});
	});
});

describe('Dashboard upcoming meetings', () => {
	it('lists meetings in the next 7 days', () => {
		renderWithCrm(<DashboardView />, NOTES);
		const panel = screen.getByRole('region', { name: 'Upcoming meetings' });
		expect(within(panel).getByText('Pilot review')).toBeInTheDocument();
		expect(within(panel).getByText(/in 4 days · 2:30/)).toBeInTheDocument();
		expect(within(panel).queryByText('Kickoff')).toBeNull();
	});
});
