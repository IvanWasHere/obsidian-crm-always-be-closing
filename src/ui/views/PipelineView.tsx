import { useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Menu, Notice } from 'obsidian';
import { isClosedStage, totalsByCurrency } from '../../core/insights';
import { formatDate } from '../../core/schema';
import type { Deal } from '../../core/types';
import { openCreateModal } from '../../obsidian/modals';
import { formatMoney, formatTotals } from '../format';
import { useCrm } from '../hooks/useCrm';
import { useOpenNote } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { Icon } from '../components/Icon';

/** A deal with the stage it's shown in (which may be a move not yet written). */
interface Card {
	deal: Deal;
	stage: string;
}

/** Drag payload type, so drops from elsewhere (files, text) are ignored. */
const DEAL_MIME = 'application/x-abc-deal';

/**
 * Kanban board of deals by stage. Cards move by drag and drop on desktop,
 * or through the card menu ("Move to …"), which also works on touch and keyboard.
 */
export function PipelineView() {
	const crm = useCrm();
	const { plugin, repo } = usePlugin();
	const { pipelineStages, defaultCurrency } = plugin.settings;

	// Stage changes shown immediately, until the index catches up with the write.
	const [pending, setPending] = useState<Record<string, string>>({});
	const cards = useMemo<Card[]>(
		() => crm.all('deal').map((deal) => ({ deal, stage: pending[deal.path] ?? deal.stage })),
		[crm, pending],
	);

	// When a new snapshot arrives, drop pending moves the index now reflects.
	const [seen, setSeen] = useState(crm);
	if (seen !== crm) {
		setSeen(crm);
		setPending((p) => Object.fromEntries(Object.entries(p).filter(([path, stage]) => crm.get(path, 'deal')?.stage !== stage)));
	}

	const move = (card: Card, stage: string) => {
		const { deal } = card;
		if (card.stage === stage) return;
		setPending((p) => ({ ...p, [deal.path]: stage }));
		repo.moveDealStage(deal.path, stage).catch((err: unknown) => {
			new Notice(`Couldn't move ${deal.name}: ${err instanceof Error ? err.message : String(err)}`);
			setPending(({ [deal.path]: _, ...rest }) => rest);
		});
	};

	// Configured stages first, then any unknown stages found in notes.
	const extraStages = [...new Set(cards.map((c) => c.stage).filter((s) => !pipelineStages.includes(s)))];
	const stages = [...pipelineStages, ...extraStages];

	const openTotal = formatTotals(
		totalsByCurrency(
			cards.filter((c) => !isClosedStage(c.stage)).map((c) => c.deal),
			defaultCurrency,
		),
	);

	return (
		<div className="abc-pipeline">
			<div className="abc-toolbar">
				<span className="abc-count">
					{cards.length} {cards.length === 1 ? 'deal' : 'deals'}
					{openTotal && <> · open pipeline {openTotal}</>}
				</span>
				<button className="mod-cta" onClick={() => openCreateModal(plugin, 'deal')}>
					<Icon name="plus" /> New deal
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
							const card = cards.find((c) => c.deal.path === path);
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
	/** Called with the dragged deal's path. */
	onDrop: (path: string, stage: string) => void;
}) {
	const [over, setOver] = useState(false);
	const total = formatTotals(
		totalsByCurrency(
			cards.map((c) => c.deal),
			defaultCurrency,
		),
	);

	const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DEAL_MIME);

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
				const path = e.dataTransfer.getData(DEAL_MIME);
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
					<DealCard
						key={card.deal.path}
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

function DealCard({
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
	const { deal } = card;
	const crm = useCrm();
	const openNote = useOpenNote();
	const company = crm.companyOf(deal.path);
	const today = formatDate(new Date());
	const overdue = deal.expectedClose !== undefined && deal.expectedClose < today && !isClosedStage(card.stage);

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
				.onClick(() => openNote(deal.path, 'tab')),
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
			draggable
			tabIndex={0}
			aria-label={deal.name}
			onDragStart={(e) => {
				e.dataTransfer.setData(DEAL_MIME, deal.path);
				e.dataTransfer.effectAllowed = 'move';
			}}
			onClick={(e) => openNote(deal.path, e)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' && e.target === e.currentTarget) openNote(deal.path, e);
			}}
			onContextMenu={showMenu}
		>
			<div className="abc-card-top">
				<div className="abc-card-title">{deal.name}</div>
				<button className="abc-card-menu clickable-icon" aria-label={`Actions for ${deal.name}`} onClick={showMenu}>
					<Icon name="more-horizontal" />
				</button>
			</div>
			{company && <div className="abc-muted">{company.name}</div>}
			<div className="abc-card-meta">
				{deal.value !== undefined && (
					<span className="abc-card-value">{formatMoney(deal.value, deal.currency ?? defaultCurrency)}</span>
				)}
				{deal.probability !== undefined && <span>{Math.round(deal.probability * 100)}%</span>}
				{deal.expectedClose && (
					<span className={overdue ? 'abc-overdue' : undefined} title="Expected close">
						<Icon name="calendar" /> {deal.expectedClose}
					</span>
				)}
			</div>
		</article>
	);
}
