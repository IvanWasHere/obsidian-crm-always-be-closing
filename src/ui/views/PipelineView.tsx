import { useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Menu, Notice, Platform } from 'obsidian';
import { isClosedStage, totalsByCurrency } from '../../core/insights';
import { formatDate } from '../../core/schema';
import type { Project } from '../../core/types';
import { openCreateModal } from '../../obsidian/modals';
import { formatMoney, formatTotals } from '../format';
import { useCrm } from '../hooks/useCrm';
import { useOpenNote } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';
import { Icon } from '../components/Icon';
import { currentPhase, projectDeadlines, requirementProgress } from '../../core/projects';

/** A project with the stage it's shown in (which may be a move not yet written). */
interface Card {
	project: Project;
	stage: string;
}

/** Drag payload type, so drops from elsewhere (files, text) are ignored. */
const PROJECT_MIME = 'application/x-abc-project';

/**
 * Kanban board of projects by stage. Cards move by drag and drop on desktop,
 * or through the card menu ("Move to …"), which also works on touch and keyboard.
 */
export function PipelineView() {
	const crm = useCrm();
	const { plugin, repo } = usePlugin();
	const { pipelineStages, defaultCurrency } = useSettings();

	// Stage changes shown immediately, until the index catches up with the write.
	const [pending, setPending] = useState<Record<string, string>>({});
	const cards = useMemo<Card[]>(
		() => crm.all('project').map((project) => ({ project, stage: pending[project.path] ?? project.stage })),
		[crm, pending],
	);

	// When a new snapshot arrives, drop pending moves the index now reflects.
	const [seen, setSeen] = useState(crm);
	if (seen !== crm) {
		setSeen(crm);
		setPending((p) => Object.fromEntries(Object.entries(p).filter(([path, stage]) => crm.get(path, 'project')?.stage !== stage)));
	}

	const move = (card: Card, stage: string) => {
		const { project } = card;
		if (card.stage === stage) return;
		setPending((p) => ({ ...p, [project.path]: stage }));
		repo.moveProjectStage(project.path, stage).catch((err: unknown) => {
			new Notice(`Couldn't move ${project.name}: ${err instanceof Error ? err.message : String(err)}`);
			setPending(({ [project.path]: _, ...rest }) => rest);
		});
	};

	// Configured stages first, then any unknown stages found in notes.
	const extraStages = [...new Set(cards.map((c) => c.stage).filter((s) => !pipelineStages.includes(s)))];
	const stages = [...pipelineStages, ...extraStages];

	const openTotal = formatTotals(
		totalsByCurrency(
			cards.filter((c) => !isClosedStage(c.stage)).map((c) => c.project),
			defaultCurrency,
		),
	);

	return (
		<div className="abc-pipeline">
			<div className="abc-toolbar">
				<span className="abc-count">
					{cards.length} {cards.length === 1 ? 'project' : 'projects'}
					{openTotal && <> · open pipeline {openTotal}</>}
				</span>
				<button className="mod-cta" onClick={() => openCreateModal(plugin, 'project')}>
					<Icon name="plus" /> New project
				</button>
			</div>
			<div className="abc-board">
				{stages.map((stage) => (
					<StageColumn
						key={stage}
						stage={stage}
						known={pipelineStages.includes(stage)}
						cards={cards.filter((c) => c.stage === stage)}
						stages={pipelineStages}
						defaultCurrency={defaultCurrency}
						onMove={move}
						onDrop={(path, target) => {
							const card = cards.find((c) => c.project.path === path);
							if (card) move(card, target);
						}}
					/>
				))}
			</div>
		</div>
	);
}

function StageColumn({
	stage,
	known,
	cards,
	stages,
	defaultCurrency,
	onMove,
	onDrop,
}: {
	stage: string;
	known: boolean;
	cards: Card[];
	stages: string[];
	defaultCurrency: string;
	onMove: (card: Card, stage: string) => void;
	/** Called with the dragged project's path. */
	onDrop: (path: string, stage: string) => void;
}) {
	const [over, setOver] = useState(false);
	const total = formatTotals(
		totalsByCurrency(
			cards.map((c) => c.project),
			defaultCurrency,
		),
	);

	const accepts = (e: DragEvent) => e.dataTransfer.types.includes(PROJECT_MIME);

	return (
		<section
			className={`abc-column${over ? ' is-drop-target' : ''}${isClosedStage(stage) ? ' is-closed' : ''}`}
			aria-label={stage}
			onDragOver={(e) => {
				if (!accepts(e)) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				setOver(true);
			}}
			onDragLeave={(e) => {
				// Ignore leave events fired when moving over child elements.
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
			}}
			onDrop={(e) => {
				setOver(false);
				const path = e.dataTransfer.getData(PROJECT_MIME);
				if (!path) return;
				e.preventDefault();
				onDrop(path, stage);
			}}
		>
			<header className="abc-column-header">
				<div className="abc-column-title">
					{stage}
					{!known && (
						<span className="abc-column-warning" title="Not one of the pipeline stages in settings">
							<Icon name="alert-triangle" />
						</span>
					)}
					<span className="abc-muted"> {cards.length}</span>
				</div>
				{total && <div className="abc-column-total">{total}</div>}
			</header>
			<div className="abc-column-cards">
				{cards.map((card) => (
					<ProjectCard
						key={card.project.path}
						card={card}
						stages={stages}
						defaultCurrency={defaultCurrency}
						onMove={onMove}
					/>
				))}
			</div>
		</section>
	);
}

function ProjectCard({
	card,
	stages,
	defaultCurrency,
	onMove,
}: {
	card: Card;
	stages: string[];
	defaultCurrency: string;
	onMove: (card: Card, stage: string) => void;
}) {
	const { project } = card;
	const crm = useCrm();
	const openNote = useOpenNote();
	const company = crm.companyOf(project.path);
	const progress = requirementProgress(crm.requirementsOf(project.path));
	const phase = currentPhase(project);
	const next = projectDeadlines(project, crm)[0];
	const today = formatDate(new Date());
	const overdue = project.expectedClose !== undefined && project.expectedClose < today && !isClosedStage(card.stage);

	const showMenu = (e: ReactMouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const menu = new Menu();
		for (const stage of stages) {
			menu.addItem((item) =>
				item
					.setTitle(`Move to ${stage}`)
					.setChecked(stage === card.stage)
					.onClick(() => onMove(card, stage)),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Open in new tab')
				.setIcon('file-plus')
				.onClick(() => openNote(project.path, 'tab')),
		);
		if (e.type === 'contextmenu') {
			menu.showAtMouseEvent(e.nativeEvent);
		} else {
			const rect = e.currentTarget.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		}
	};

	return (
		<article
			className="abc-card"
			// Touch devices can't use HTML drag and drop; the card menu moves projects there.
			draggable={!Platform.isMobile}
			tabIndex={0}
			aria-label={project.name}
			onDragStart={(e) => {
				e.dataTransfer.setData(PROJECT_MIME, project.path);
				e.dataTransfer.effectAllowed = 'move';
			}}
			onClick={(e) => openNote(project.path, e)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' && e.target === e.currentTarget) openNote(project.path, e);
			}}
			onContextMenu={showMenu}
		>
			<div className="abc-card-top">
				<div className="abc-card-title">{project.name}</div>
				<button className="abc-card-menu clickable-icon" aria-label={`Actions for ${project.name}`} onClick={showMenu}>
					<Icon name="more-horizontal" />
				</button>
			</div>
			{company && <div className="abc-muted">{company.name}</div>}
			<div className="abc-card-meta">
				{project.value !== undefined && (
					<span className="abc-card-value">{formatMoney(project.value, project.currency ?? defaultCurrency)}</span>
				)}
				{project.probability !== undefined && <span>{Math.round(project.probability * 100)}%</span>}
				{project.expectedClose && (
					<span className={overdue ? 'abc-overdue' : undefined} title="Expected close">
						<Icon name="calendar" /> {project.expectedClose}
					</span>
				)}
			</div>
			{(phase || progress.total > 0 || next) && (
				<div className="abc-card-meta">
					{phase && <span title="Current phase">{phase.name}</span>}
					{progress.total > 0 && (
						<span title="Requirements done">
							<Icon name="check-square" /> {progress.done}/{progress.total}
						</span>
					)}
					{next && (
						<span className={next.date < today ? 'abc-overdue' : undefined} title={`Next deadline: ${next.label}`}>
							<Icon name="flag" /> {next.date}
						</span>
					)}
				</div>
			)}
		</article>
	);
}
