import { Notice } from 'obsidian';
import type CrmPlugin from '../main';
import type { FieldValues } from '../core/fields';
import { formatDate } from '../core/schema';
import type { EntityType } from '../core/types';
import { EntityForm } from '../ui/components/EntityForm';
import { ReactModal } from './ReactModal';

const TITLES: Record<Exclude<EntityType, 'interaction'>, string> = {
	contact: 'New contact',
	company: 'New company',
	deal: 'New deal',
};

/** Opens a form for a new contact, company or deal, then opens the created note. */
export function openCreateModal(plugin: CrmPlugin, type: Exclude<EntityType, 'interaction'>, initial: FieldValues = {}) {
	new ReactModal(plugin, TITLES[type], (close) => (
		<EntityForm
			type={type}
			initial={initial}
			submitLabel="Create"
			onSubmit={async (values, body) => {
				const file = await plugin.repo.createEntity(type, values, body);
				close();
				await plugin.app.workspace.getLeaf(false).openFile(file);
			}}
		/>
	)).open();
}

/** Opens the "log interaction" form. Stays on the current note afterwards. */
export function openLogInteractionModal(plugin: CrmPlugin, initial: FieldValues = {}) {
	new ReactModal(plugin, 'Log interaction', (close) => (
		<EntityForm
			type="interaction"
			initial={{ kind: 'call', date: formatDate(new Date()), ...initial }}
			submitLabel="Log"
			bodyLabel="Notes"
			onSubmit={async (values, body) => {
				await plugin.repo.logInteraction(values, body);
				close();
				new Notice('Interaction logged');
			}}
		/>
	)).open();
}
