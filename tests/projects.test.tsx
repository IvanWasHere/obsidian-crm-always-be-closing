import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarEvents } from '../src/core/calendar';
import { fieldSpec } from '../src/core/fields';
import { currentPhase, parsePhases, projectDeadlines, requirementProgress, sortRequirements } from '../src/core/projects';
import { parseEntity } from '../src/core/schema';
import type { Requirement } from '../src/core/types';
import { valuesFrom } from '../src/obsidian/prefill';
import { EntityPanel } from '../src/ui/views/EntityPanel';
import { PipelineView } from '../src/ui/views/PipelineView';
import { FuzzySuggestModal } from './mocks/obsidian';
import { SEED, renderWithCrm, setup } from './fixtures';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const PILOT = 'CRM/Projects/Acme - Pilot.md';
const NOTES = {
	...SEED,
	[PILOT]: {
		...SEED[PILOT],
		deadline: '2026-11-30',
		phases: [
			{ name: 'Discovery', deadline: '2026-09-15', done: true },
			{ name: 'Build', deadline: '2026-10-20' },
			'Launch',
		],
		assets: ['[[wireframes.png|Wireframes]]', '[[Contract.pdf]]', '[[missing.fig]]'],
	},
	'CRM/Requirements/SSO login.md': { type: 'crm-requirement', project: '[[Acme - Pilot]]', status: 'open', priority: 'high', deadline: '2026-09-20' },
	'CRM/Requirements/Reports export.md': { type: 'crm-requirement', project: '[[Acme - Pilot]]', status: 'done' },
	'CRM/Requirements/Dark mode.md': { type: 'crm-requirement', project: '[[Acme - Pilot]]', status: 'in-progress', priority: 'low' },
	'CRM/Requirements/Fax support.md': { type: 'crm-requirement', project: '[[Acme - Pilot]]', status: 'dropped' },
};

function withFiles(ctx: ReturnType<typeof setup>) {
	for (const name of ['wireframes.png', 'Contract.pdf']) {
		void ctx.app.vault.createBinary(`Assets/${name}`, new ArrayBuffer(1));
	}
	ctx.index.requestRescan();
	ctx.index.flush();
	return ctx;
}

describe('phases', () => {
	it('parses objects and plain names, reporting junk', () => {
		expect(parsePhases([{ name: 'A', deadline: '2026-10-01', done: true }, 'B', { deadline: '2026-01-01' }, 42])).toEqual({
			phases: [
				{ name: 'A', deadline: '2026-10-01', done: true },
				{ name: 'B', done: false },
			],
			invalid: 2,
		});
		const project = parseEntity('project', 'p.md', { stage: 'lead', phases: [{ name: 'A', done: true }, 'B'] }, { stages: ['lead'] });
		expect(project.type === 'project' && currentPhase(project)?.name).toBe('B');
	});
});

describe('requirements', () => {
	it('link to projects and sort open → done → dropped, then by priority and deadline', () => {
		const { index } = setup(NOTES);
		const crm = index.getSnapshot();
		const list = sortRequirements(crm.requirementsOf(PILOT));
		expect(list.map((r) => r.name)).toEqual(['SSO login', 'Dark mode', 'Reports export', 'Fax support']);
		expect(requirementProgress(list)).toEqual({ done: 1, total: 3 });
		expect(crm.projectOf('CRM/Requirements/SSO login.md')?.path).toBe(PILOT);
	});

	it('parse with defaults and validation', () => {
		const r = parseEntity('requirement', 'CRM/Requirements/X.md', { status: 'maybe', priority: 'urgent' }, { stages: [] }) as Requirement;
		expect(r).toMatchObject({ name: 'X', status: 'open', priority: 'medium' });
		expect(r.issues).toHaveLength(2);
	});

	it('are created with an open status in the requirements folder', async () => {
		const { app, repo } = setup(NOTES);
		const file = await repo.createEntity('requirement', { name: 'Audit log', project: [PILOT], priority: 'high' }, 'Keep 90 days.');
		expect(file.path).toBe('CRM/Requirements/Audit log.md');
		expect(app.vault.readNote(file.path)).toMatchObject({
			frontmatter: { type: 'crm-requirement', name: 'Audit log', project: '[[Acme - Pilot]]', status: 'open', priority: 'high' },
			body: 'Keep 90 days.',
		});
	});

	it('pre-fill the project from a project or a sibling requirement', () => {
		const { index } = setup(NOTES);
		const crm = index.getSnapshot();
		expect(valuesFrom(crm.get(PILOT)!, crm, 'requirement')).toEqual({ project: [PILOT] });
		expect(valuesFrom(crm.get('CRM/Requirements/SSO login.md')!, crm, 'requirement')).toEqual({ project: [PILOT] });
		// Logging from a requirement links its project.
		expect(valuesFrom(crm.get('CRM/Requirements/SSO login.md')!, crm, 'interaction')).toMatchObject({ project: [PILOT] });
	});
});

describe('deadlines and assets', () => {
	it('collects what is still due on a project, soonest first', () => {
		const { index } = setup(NOTES);
		const crm = index.getSnapshot();
		expect(projectDeadlines(crm.get(PILOT, 'project')!, crm).map((d) => [d.date, d.label])).toEqual([
			['2026-09-20', 'SSO login'],
			['2026-10-20', 'Phase: Build'],
			['2026-11-30', 'Project deadline'],
		]);
		const events = calendarEvents(crm, '2026-09-01', '2026-12-01', '2026-09-25', new Set(['deadline']));
		expect(events.map((e) => [e.title, e.overdue])).toEqual([
			['Due: SSO login', true],
			['Phase: Build due', false],
			['Deadline: Acme – Pilot', false],
		]);
		expect(events[0]!.path).toBe('CRM/Requirements/SSO login.md');
	});

	it('resolves asset links to any vault file and keeps missing ones visible', () => {
		const ctx = withFiles(setup(NOTES));
		const crm = ctx.index.getSnapshot();
		expect(crm.linkedPaths(PILOT, 'assets')).toEqual(['Assets/wireframes.png', 'Assets/Contract.pdf']);
		expect(crm.unresolvedLinks(PILOT, 'assets')).toEqual(['missing.fig']);
	});

	it('writes phases and assets, keeping missing asset links', async () => {
		const ctx = withFiles(setup(NOTES));
		await ctx.repo.setField(PILOT, fieldSpec('project', 'phases')!, [
			{ name: ' Build ', deadline: '2026-10-20', done: 'true' },
			{ name: '', deadline: '', done: '' },
			{ name: 'Launch', deadline: '', done: '' },
		]);
		await ctx.repo.setField(PILOT, fieldSpec('project', 'assets')!, ['Assets/Contract.pdf'], ['missing.fig']);
		expect(ctx.app.vault.readNote(PILOT)?.frontmatter).toMatchObject({
			phases: [{ name: 'Build', deadline: '2026-10-20', done: true }, { name: 'Launch' }],
			assets: ['[[Contract.pdf]]', '[[missing.fig]]'],
		});
	});
});

describe('project UI', () => {
	function open(ctx: ReturnType<typeof renderWithCrm>, path: string) {
		act(() => ctx.app.workspace.setActiveFile(ctx.app.vault.file(path)));
	}

	it('shows the current phase, next deadline and a requirements checklist', async () => {
		const ctx = renderWithCrm(<EntityPanel />, NOTES);
		open(ctx, PILOT);
		expect(screen.getByText(/proposal · phase: Build · 1\/3 requirements done/)).toBeInTheDocument();
		expect(screen.getByText(/Next: SSO login, 5 days ago/)).toHaveClass('abc-overdue');

		const section = screen.getByRole('heading', { name: /Requirements/ }).closest('section')!;
		expect(within(section).getAllByRole('link').map((a) => a.textContent)).toEqual([
			'SSO login',
			'Dark mode',
			'Reports export',
			'Fax support',
		]);
		fireEvent.click(within(section).getByRole('checkbox', { name: 'SSO login done' }));
		await waitFor(() => expect(ctx.app.vault.readNote('CRM/Requirements/SSO login.md')?.frontmatter?.status).toBe('done'));
		expect(within(section).getByRole('checkbox', { name: 'Fax support done' })).toBeDisabled();
	});

	it('edits phases and saves when focus leaves the editor', async () => {
		const ctx = renderWithCrm(<EntityPanel />, NOTES);
		open(ctx, PILOT);
		fireEvent.change(screen.getByLabelText('Phase 3 name'), { target: { value: 'Go-live' } });
		fireEvent.click(screen.getByRole('button', { name: 'Move phase 3 up' }));
		expect(ctx.app.vault.readNote(PILOT)?.frontmatter?.phases).toHaveLength(3); // not saved yet
		fireEvent.blur(screen.getByLabelText('Phase 2 name'));
		await waitFor(() =>
			expect((ctx.app.vault.readNote(PILOT)?.frontmatter?.phases as { name: string }[]).map((p) => p.name)).toEqual([
				'Discovery',
				'Go-live',
				'Build',
			]),
		);
	});

	it('links assets through the file picker', async () => {
		const ctx = renderWithCrm(<EntityPanel />, NOTES);
		act(() => void withFiles(ctx));
		open(ctx, PILOT);
		// Decorative thumbnail (empty alt); the file name beside it is the link.
		expect(document.querySelector('.abc-asset-thumb')).toHaveAttribute('src', 'app://local/Assets/wireframes.png');
		expect(screen.getByText(/File not found: \[\[missing.fig\]\]/)).toBeInTheDocument();

		const opened = vi.spyOn(FuzzySuggestModal.prototype, 'open');
		void ctx.app.vault.createBinary('Assets/logo.svg', new ArrayBuffer(1));
		fireEvent.click(screen.getByRole('button', { name: /Add file/ }));
		const picker = opened.mock.contexts[0] as FuzzySuggestModal<{ path: string }> & {
			getItems(): { path: string }[];
			onChooseItem(f: unknown): void;
		};
		expect(picker.getItems().map((f) => f.path)).toContain('Assets/logo.svg');
		expect(picker.getItems().map((f) => f.path)).not.toContain('Assets/wireframes.png');
		act(() => picker.onChooseItem(ctx.app.vault.getAbstractFileByPath('Assets/logo.svg')));
		await waitFor(() =>
			expect(ctx.app.vault.readNote(PILOT)?.frontmatter?.assets).toEqual([
				'[[wireframes.png]]',
				'[[Contract.pdf]]',
				'[[logo.svg]]',
				'[[missing.fig]]',
			]),
		);
	});

	it('shows phase, progress and next deadline on pipeline cards', () => {
		renderWithCrm(<PipelineView />, NOTES);
		const card = screen.getByRole('article', { name: 'Acme – Pilot' });
		expect(within(card).getByText('Build')).toBeInTheDocument();
		expect(within(card).getByTitle('Requirements done')).toHaveTextContent('1/3');
		expect(within(card).getByTitle('Next deadline: SSO login')).toHaveClass('abc-overdue');
	});
});
