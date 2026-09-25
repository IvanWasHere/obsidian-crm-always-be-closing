import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Menu } from './mocks/obsidian';
import { PipelineView } from '../src/ui/views/PipelineView';
import { SEED, renderWithCrm } from './fixtures';

const PILOT = 'CRM/Projects/Acme - Pilot.md';
const column = (stage: string) => screen.getByRole('region', { name: stage });
const cardsIn = (stage: string) => within(column(stage)).queryAllByRole('article').map((a) => a.getAttribute('aria-label'));

/** Minimal DataTransfer, since jsdom doesn't implement one. */
function dataTransfer() {
	const data: Record<string, string> = {};
	return {
		setData: (type: string, value: string) => void (data[type] = value),
		getData: (type: string) => data[type] ?? '',
		get types() {
			return Object.keys(data);
		},
		effectAllowed: 'none',
		dropEffect: 'none',
	};
}

describe('PipelineView', () => {
	it('shows a column per stage with counts and totals', () => {
		renderWithCrm(<PipelineView />);
		expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
			'lead',
			'qualified',
			'proposal',
			'negotiation',
			'won',
			'lost',
		]);
		expect(cardsIn('proposal')).toEqual(['Acme – Pilot']);
		expect(cardsIn('lead')).toEqual(['Globex – Discovery']);
		expect(within(column('proposal')).getByText(/12,000/, { selector: '.abc-column-total' })).toBeInTheDocument();
		expect(within(column('proposal')).getByText('Acme Inc')).toBeInTheDocument();
	});

	it('adds a flagged column for stages missing from settings', () => {
		renderWithCrm(<PipelineView />, { ...SEED, 'CRM/Projects/Odd.md': { type: 'crm-project', stage: 'parked' } });
		expect(cardsIn('parked')).toEqual(['Odd']);
		expect(within(column('parked')).getByTitle('Not one of the pipeline stages in settings')).toBeInTheDocument();
	});

	it('moves a project by drag and drop, showing it in the new column right away', async () => {
		const ctx = renderWithCrm(<PipelineView />);
		const dt = dataTransfer();
		fireEvent.dragStart(screen.getByRole('article', { name: 'Acme – Pilot' }), { dataTransfer: dt });
		fireEvent.dragOver(column('negotiation'), { dataTransfer: dt });
		expect(column('negotiation')).toHaveClass('is-drop-target');
		fireEvent.drop(column('negotiation'), { dataTransfer: dt });

		expect(cardsIn('negotiation')).toEqual(['Acme – Pilot']);
		expect(cardsIn('proposal')).toEqual([]);
		await waitFor(() => expect(ctx.app.vault.readNote(PILOT)?.frontmatter?.stage).toBe('negotiation'));
		act(() => ctx.index.flush());
		expect(cardsIn('negotiation')).toEqual(['Acme – Pilot']);
	});

	it('ignores drops that are not projects', () => {
		const ctx = renderWithCrm(<PipelineView />);
		const dt = dataTransfer();
		dt.setData('text/plain', 'hello');
		fireEvent.drop(column('won'), { dataTransfer: dt });
		expect(cardsIn('won')).toEqual([]);
		expect(ctx.app.vault.readNote(PILOT)?.frontmatter?.stage).toBe('proposal');
	});

	it('moves a project from the card menu', async () => {
		const ctx = renderWithCrm(<PipelineView />);
		fireEvent.click(screen.getByRole('button', { name: 'Actions for Acme – Pilot' }));
		const menu = Menu.shown!;
		expect(menu.items.find((i) => i.checked)?.title).toBe('Move to proposal');

		act(() => menu.items.find((i) => i.title === 'Move to won')!.click!());
		expect(cardsIn('won')).toEqual(['Acme – Pilot']);
		await waitFor(() => expect(ctx.app.vault.readNote(PILOT)?.frontmatter?.stage).toBe('won'));
		// The menu button must not also open the note.
		expect(ctx.app.workspace.opened).toEqual([]);
	});

	it('opens the note when a card is clicked', () => {
		const ctx = renderWithCrm(<PipelineView />);
		fireEvent.click(screen.getByRole('article', { name: 'Acme – Pilot' }));
		expect(ctx.app.workspace.opened).toEqual([{ path: PILOT, newLeaf: false }]);
	});
});
