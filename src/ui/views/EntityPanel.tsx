import { useState, type ReactNode } from 'react';
import { Notice } from 'obsidian';
import type { CrmSnapshot } from '../../core/CrmSnapshot';
import { fieldsFor, type FieldSpec, type FieldValue } from '../../core/fields';
import type { Entity, EntityType, Interaction, Project, Requirement } from '../../core/types';
import { contextValues } from '../../obsidian/prefill';
import { openCreateModal, openLogInteractionModal, openScheduleModal } from '../../obsidian/modals';
import { exportMeetingIcs } from '../../obsidian/ics';
import { readFieldValue, sameValue } from '../fieldValues';
import { useCrm } from '../hooks/useCrm';
import { useActiveFilePath } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';
import { FieldInput } from '../components/FieldInput';
import { Icon } from '../components/Icon';
import { NoteLink } from '../components/NoteLink';
import { currentPhase, isOpenRequirement, projectDeadlines, requirementProgress, sortRequirements } from '../../core/projects';
import { relativeDay } from '../format';
import { formatDate } from '../../core/schema';
import { BillingActions } from '../components/BillingActions';
import { BillingStatus } from '../components/BillingStatus';
import { formatMoney } from '../format';

const TYPE_LABELS: Record<EntityType, string> = {
	contact: 'Contact',
	company: 'Company',
	project: 'Project',
	interaction: 'Interaction',
	quote: 'Quote',
	invoice: 'Invoice',
	requirement: 'Requirement',
};

const KIND_ICONS: Record<Interaction['kind'], string> = {
	call: 'phone',
	email: 'mail',
	meeting: 'users',
	message: 'message-square',
	note: 'sticky-note',
};

/** Details of the CRM note in the active editor, for the right sidebar. */
export function EntityPanel() {
	const crm = useCrm();
	const path = useActiveFilePath();
	const entity = path ? crm.get(path) : undefined;

	if (!entity) {
		return <div className="abc-panel abc-empty">Open a CRM note (contact, company, project, quote…) to see its details here.</div>;
	}
	// Remount per note so field drafts never leak between notes.
	return <EntityDetails key={entity.path} entity={entity} crm={crm} />;
}

function EntityDetails({ entity, crm }: { entity: Entity; crm: CrmSnapshot }) {
	const { plugin } = usePlugin();
	const settings = useSettings();
	const specs = fieldsFor(entity.type, settings).filter((s) => s.key !== 'name');

	return (
		<div className="abc-panel">
			<div className="abc-panel-header">
				<div className="abc-panel-type">{TYPE_LABELS[entity.type]}</div>
				<h3 className="abc-panel-title">{entity.name}</h3>
				{entity.type === 'project' && <ProjectSummary project={entity} crm={crm} />}
				{(entity.type === 'quote' || entity.type === 'invoice') && (
					<div className="abc-panel-subtitle">
						<BillingStatus doc={entity} />
						<span className="abc-muted">
							{' · '}
							{formatMoney(entity.totals.gross, entity.currency ?? settings.defaultCurrency)}
						</span>
					</div>
				)}
				<div className="abc-panel-actions">
					{(entity.type === 'contact' || entity.type === 'project') && (
						<>
							<button onClick={() => openLogInteractionModal(plugin, contextValues(plugin, 'interaction'))}>
								<Icon name="message-square-plus" /> Log interaction
							</button>
							<button onClick={() => openScheduleModal(plugin, contextValues(plugin, 'interaction'))}>
								<Icon name="calendar-plus" /> Schedule meeting
							</button>
						</>
					)}
					{(entity.type === 'project' || entity.type === 'requirement') && (
						<button onClick={() => openCreateModal(plugin, 'requirement', contextValues(plugin, 'requirement'))}>
							<Icon name="list-plus" /> Requirement
						</button>
					)}
					{entity.type === 'company' && (
						<>
							<button onClick={() => openCreateModal(plugin, 'contact', { company: [entity.path] })}>
								<Icon name="user-plus" /> Contact
							</button>
							<button onClick={() => openCreateModal(plugin, 'project', { company: [entity.path] })}>
								<Icon name="plus" /> Project
							</button>
						</>
					)}
					{(entity.type === 'company' || entity.type === 'contact' || entity.type === 'project') && (
						<>
							<button onClick={() => openCreateModal(plugin, 'quote', contextValues(plugin, 'billing'))}>
								<Icon name="file-text" /> Quote
							</button>
							<button onClick={() => openCreateModal(plugin, 'invoice', contextValues(plugin, 'billing'))}>
								<Icon name="receipt" /> Invoice
							</button>
						</>
					)}
					{(entity.type === 'quote' || entity.type === 'invoice') && <BillingActions doc={entity} />}
					{entity.type === 'interaction' && entity.date && (
						<button onClick={() => void exportMeetingIcs(plugin, entity)}>
							<Icon name="calendar-plus" /> Add to calendar
						</button>
					)}
				</div>
			</div>

			{entity.issues.length > 0 && (
				<div className="abc-issues" role="note">
					<div className="abc-issues-title">
						<Icon name="alert-triangle" /> Problems in this note
					</div>
					<ul>
						{entity.issues.map((issue) => (
							<li key={issue}>{issue}</li>
						))}
					</ul>
				</div>
			)}

			<div className="abc-fields">
				{specs.map((spec) => {
					const value = readFieldValue(spec, entity, crm);
					return (
						<PanelField
							// Reset the draft whenever the stored value changes.
							key={`${spec.key}:${JSON.stringify(value)}`}
							entity={entity}
							spec={spec}
							value={value}
							unresolved={crm.unresolvedLinks(entity.path, spec.key)}
						/>
					);
				})}
			</div>

			<Related entity={entity} crm={crm} />
		</div>
	);
}

function PanelField({
	entity,
	spec,
	value,
	unresolved,
}: {
	entity: Entity;
	spec: FieldSpec;
	value: FieldValue;
	unresolved: string[];
}) {
	const { repo } = usePlugin();
	const [draft, setDraft] = useState<FieldValue>(value);
	const id = `abc-field-${spec.key}`;

	const save = (next: FieldValue) => {
		if (sameValue(next, value)) return;
		// Keep links to non-CRM notes: they aren't shown in the picker, so they can't have been removed on purpose.
		const keeps = spec.kind === 'links' || spec.kind === 'assets';
		repo.setField(entity.path, spec, next, keeps ? unresolved : []).catch((err: unknown) => {
			new Notice(err instanceof Error ? err.message : String(err));
			setDraft(value);
		});
	};

	// Text-like fields save on blur/Enter; pickers, dates and selects save right away.
	const savesOnCommit = !['link', 'links', 'assets', 'select', 'date', 'time', 'checkbox'].includes(spec.kind);

	return (
		<div className="abc-field">
			<label htmlFor={id}>{spec.label}</label>
			<FieldInput
				id={id}
				spec={spec}
				value={draft}
				onChange={(next) => {
					setDraft(next);
					if (!savesOnCommit) save(next);
				}}
				onCommit={savesOnCommit ? () => save(draft) : undefined}
			/>
			{unresolved.length > 0 && (
				<div className="abc-hint">
					{spec.kind === 'assets' ? 'File not found' : 'Not a CRM note'}: {unresolved.map((l) => `[[${l}]]`).join(', ')}
					{spec.kind === 'links' || spec.kind === 'assets'
						? ' (kept when you edit this field)'
						: ' (replaced if you pick one)'}
				</div>
			)}
		</div>
	);
}

function Related({ entity, crm }: { entity: Entity; crm: CrmSnapshot }) {
	switch (entity.type) {
		case 'contact':
			return (
				<>
					<EntityList title="Projects" entities={crm.projectsOf(entity.path)} />
					<EntityList title="Quotes" entities={crm.quotesOf(entity.path)} hideEmpty />
					<EntityList title="Invoices" entities={crm.invoicesOf(entity.path)} hideEmpty />
					<Timeline interactions={crm.interactionsOf(entity.path)} crm={crm} />
				</>
			);
		case 'company':
			return (
				<>
					<EntityList title="Contacts" entities={crm.contactsOf(entity.path)} />
					<EntityList title="Projects" entities={crm.projectsOf(entity.path)} />
					<EntityList title="Quotes" entities={crm.quotesOf(entity.path)} hideEmpty />
					<EntityList title="Invoices" entities={crm.invoicesOf(entity.path)} hideEmpty />
					<Timeline interactions={crm.interactionsOf(entity.path)} crm={crm} />
				</>
			);
		case 'project':
			return (
				<>
					<Requirements project={entity} crm={crm} />
					<EntityList title="Quotes" entities={crm.quotesOf(entity.path)} hideEmpty />
					<EntityList title="Invoices" entities={crm.invoicesOf(entity.path)} hideEmpty />
					<Timeline interactions={crm.interactionsOf(entity.path)} crm={crm} />
				</>
			);
		case 'quote':
			return <EntityList title="Invoices" entities={crm.invoicesOf(entity.path)} hideEmpty />;
		case 'interaction':
		case 'invoice':
		case 'requirement':
			return null;
	}
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
	return (
		<section className="abc-section">
			<h4>
				{title} <span className="abc-muted">{count}</span>
			</h4>
			{children}
		</section>
	);
}

function EntityList({ title, entities, hideEmpty }: { title: string; entities: readonly Entity[]; hideEmpty?: boolean }) {
	const { defaultCurrency } = useSettings();
	if (hideEmpty && entities.length === 0) return null;
	return (
		<Section title={title} count={entities.length}>
			{entities.length === 0 ? (
				<div className="abc-muted">None</div>
			) : (
				<ul className="abc-list">
					{entities.map((e) => (
						<li key={e.path}>
							<NoteLink path={e.path}>{e.name}</NoteLink>
							{e.type === 'project' && <span className="abc-muted"> · {e.stage}</span>}
							{e.type === 'contact' && e.role && <span className="abc-muted"> · {e.role}</span>}
							{(e.type === 'quote' || e.type === 'invoice') && (
								<span className="abc-muted">
									{' · '}
									<BillingStatus doc={e} /> · {formatMoney(e.totals.gross, e.currency ?? defaultCurrency)}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

function Timeline({ interactions, crm }: { interactions: readonly Interaction[]; crm: CrmSnapshot }) {
	return (
		<Section title="Interactions" count={interactions.length}>
			{interactions.length === 0 ? (
				<div className="abc-muted">None yet</div>
			) : (
				<ol className="abc-timeline">
					{interactions.map((i) => (
						<li key={i.path}>
							<Icon name={KIND_ICONS[i.kind]} className="abc-timeline-icon" />
							<div>
								<NoteLink path={i.path}>{i.summary ?? i.name}</NoteLink>
								<div className="abc-muted">
									{[i.date, i.kind, ...crm.contactsOf(i.path).map((c) => c.name)].filter(Boolean).join(' · ')}
								</div>
							</div>
						</li>
					))}
				</ol>
			)}
		</Section>
	);
}

/** Current phase, requirement progress and the next thing due, under the project title. */
function ProjectSummary({ project, crm }: { project: Project; crm: CrmSnapshot }) {
	const today = formatDate(new Date());
	const phase = currentPhase(project);
	const progress = requirementProgress(crm.requirementsOf(project.path));
	const next = projectDeadlines(project, crm)[0];
	const parts = [
		project.stage,
		phase && `phase: ${phase.name}`,
		progress.total > 0 && `${progress.done}/${progress.total} requirements done`,
	].filter(Boolean);
	return (
		<div className="abc-panel-subtitle abc-muted">
			{parts.join(' · ')}
			{next && (
				<div className={next.date < today ? 'abc-overdue' : undefined}>
					<Icon name={next.date < today ? 'alert-triangle' : 'flag'} /> Next: {next.label}, {relativeDay(next.date, today)}
				</div>
			)}
		</div>
	);
}

/** A project's requirements as a checklist: ticking one marks it done. */
function Requirements({ project, crm }: { project: Project; crm: CrmSnapshot }) {
	const { repo } = usePlugin();
	const today = formatDate(new Date());
	const list = sortRequirements(crm.requirementsOf(project.path));
	const progress = requirementProgress(list);

	const setStatus = (r: Requirement, status: Requirement['status']) => {
		repo.updateFields(r.path, { status }).catch((err: unknown) => new Notice(err instanceof Error ? err.message : String(err)));
	};

	return (
		<Section title="Requirements" count={list.length}>
			{list.length === 0 ? (
				<div className="abc-muted">None yet</div>
			) : (
				<>
					<progress className="abc-progress" max={Math.max(progress.total, 1)} value={progress.done} aria-label="Requirements done" />
					<ul className="abc-requirements">
						{list.map((r) => {
							const overdue = isOpenRequirement(r) && r.deadline !== undefined && r.deadline < today;
							return (
								<li key={r.path} className={`is-${r.status}`}>
									<input
										type="checkbox"
										aria-label={`${r.name} done`}
										checked={r.status === 'done'}
										disabled={r.status === 'dropped'}
										onChange={(e) => setStatus(r, e.target.checked ? 'done' : 'open')}
									/>
									<div>
										<NoteLink path={r.path}>{r.name}</NoteLink>
										<div className="abc-muted abc-requirement-meta">
											{[
												r.status !== 'open' && r.status !== 'done' ? r.status : '',
												r.priority ? `${r.priority} priority` : '',
											]
												.filter(Boolean)
												.join(' · ')}
											{r.deadline && (
												<span className={overdue ? 'abc-overdue' : undefined}>
													{' '}
													{overdue && <Icon name="alert-triangle" />} due {relativeDay(r.deadline, today)}
												</span>
											)}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</>
			)}
		</Section>
	);
}
