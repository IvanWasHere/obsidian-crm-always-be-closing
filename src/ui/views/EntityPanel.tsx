import { useState, type ReactNode } from 'react';
import { Notice } from 'obsidian';
import type { CrmSnapshot } from '../../core/CrmSnapshot';
import { FIELDS, type FieldSpec, type FieldValue } from '../../core/fields';
import type { Entity, EntityType, Interaction } from '../../core/types';
import { contextValues } from '../../obsidian/commands';
import { openCreateModal, openLogInteractionModal } from '../../obsidian/modals';
import { readFieldValue, sameValue } from '../fieldValues';
import { useCrm } from '../hooks/useCrm';
import { useActiveFilePath } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { FieldInput } from '../components/FieldInput';
import { Icon } from '../components/Icon';
import { NoteLink } from '../components/NoteLink';

const TYPE_LABELS: Record<EntityType, string> = {
	contact: 'Contact',
	company: 'Company',
	deal: 'Deal',
	interaction: 'Interaction',
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
		return <div className="abc-panel abc-empty">Open a contact, company, deal or interaction note to see its details here.</div>;
	}
	// Remount per note so field drafts never leak between notes.
	return <EntityDetails key={entity.path} entity={entity} crm={crm} />;
}

function EntityDetails({ entity, crm }: { entity: Entity; crm: CrmSnapshot }) {
	const { plugin } = usePlugin();
	const specs = FIELDS[entity.type].filter((s) => s.key !== 'name');

	return (
		<div className="abc-panel">
			<div className="abc-panel-header">
				<div className="abc-panel-type">{TYPE_LABELS[entity.type]}</div>
				<h3 className="abc-panel-title">{entity.name}</h3>
				<div className="abc-panel-actions">
					{(entity.type === 'contact' || entity.type === 'deal') && (
						<button onClick={() => openLogInteractionModal(plugin, contextValues(plugin, 'interaction'))}>
							<Icon name="message-square-plus" /> Log interaction
						</button>
					)}
					{entity.type === 'company' && (
						<>
							<button onClick={() => openCreateModal(plugin, 'contact', { company: [entity.path] })}>
								<Icon name="user-plus" /> Contact
							</button>
							<button onClick={() => openCreateModal(plugin, 'deal', { company: [entity.path] })}>
								<Icon name="plus" /> Deal
							</button>
						</>
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
		repo.setField(entity.path, spec, next).catch((err: unknown) => {
			new Notice(err instanceof Error ? err.message : String(err));
			setDraft(value);
		});
	};

	// Text-like fields save on blur/Enter; pickers, dates and selects save right away.
	const savesOnCommit = !['link', 'links', 'select', 'date'].includes(spec.kind);

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
					Not a CRM note: {unresolved.map((l) => `[[${l}]]`).join(', ')}
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
					<EntityList title="Deals" entities={crm.dealsOf(entity.path)} />
					<Timeline interactions={crm.interactionsOf(entity.path)} crm={crm} />
				</>
			);
		case 'company':
			return (
				<>
					<EntityList title="Contacts" entities={crm.contactsOf(entity.path)} />
					<EntityList title="Deals" entities={crm.dealsOf(entity.path)} />
					<Timeline interactions={crm.interactionsOf(entity.path)} crm={crm} />
				</>
			);
		case 'deal':
			return <Timeline interactions={crm.interactionsOf(entity.path)} crm={crm} />;
		case 'interaction':
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

function EntityList({ title, entities }: { title: string; entities: readonly Entity[] }) {
	return (
		<Section title={title} count={entities.length}>
			{entities.length === 0 ? (
				<div className="abc-muted">None</div>
			) : (
				<ul className="abc-list">
					{entities.map((e) => (
						<li key={e.path}>
							<NoteLink path={e.path}>{e.name}</NoteLink>
							{e.type === 'deal' && <span className="abc-muted"> · {e.stage}</span>}
							{e.type === 'contact' && e.role && <span className="abc-muted"> · {e.role}</span>}
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
