import type CrmPlugin from '../main';
import type { FieldValues } from '../core/fields';
import { openCreateModal, openLogInteractionModal } from './modals';
import {
	VIEW_TYPE_COMPANIES,
	VIEW_TYPE_CONTACTS,
	VIEW_TYPE_ENTITY_PANEL,
	VIEW_TYPE_HOME,
	VIEW_TYPE_PIPELINE,
} from './views';

/**
 * Pre-fills forms from the active note: e.g. "New deal" on a company note
 * links the company, "Log interaction" on a deal links the deal and its contacts.
 */
export function contextValues(plugin: CrmPlugin, form: 'contact' | 'deal' | 'interaction'): FieldValues {
	const path = plugin.app.workspace.getActiveFile()?.path;
	const crm = plugin.index.getSnapshot();
	const entity = path ? crm.get(path) : undefined;
	if (!entity) return {};

	switch (entity.type) {
		case 'company':
			return form === 'interaction' ? {} : { company: [entity.path] };
		case 'contact': {
			const company = crm.linkedPaths(entity.path, 'company');
			if (form === 'contact') return { company };
			return { contacts: [entity.path], ...(form === 'deal' ? { company } : {}) };
		}
		case 'deal':
			if (form !== 'interaction') return { company: crm.linkedPaths(entity.path, 'company') };
			return { deal: [entity.path], contacts: crm.linkedPaths(entity.path, 'contacts') };
		case 'interaction':
			return {};
	}
}

export function registerCommands(plugin: CrmPlugin) {
	plugin.addCommand({
		id: 'open-home',
		name: 'Open dashboard',
		callback: () => void plugin.activateView(VIEW_TYPE_HOME),
	});
	plugin.addCommand({
		id: 'open-contacts',
		name: 'Open contacts',
		callback: () => void plugin.activateView(VIEW_TYPE_CONTACTS),
	});
	plugin.addCommand({
		id: 'open-companies',
		name: 'Open companies',
		callback: () => void plugin.activateView(VIEW_TYPE_COMPANIES),
	});
	plugin.addCommand({
		id: 'open-pipeline',
		name: 'Open deal pipeline',
		callback: () => void plugin.activateView(VIEW_TYPE_PIPELINE),
	});
	plugin.addCommand({
		id: 'open-details-panel',
		name: 'Show details panel',
		callback: () => void plugin.activateView(VIEW_TYPE_ENTITY_PANEL, 'right'),
	});
	plugin.addCommand({
		id: 'new-contact',
		name: 'New contact',
		callback: () => openCreateModal(plugin, 'contact', contextValues(plugin, 'contact')),
	});
	plugin.addCommand({
		id: 'new-company',
		name: 'New company',
		callback: () => openCreateModal(plugin, 'company'),
	});
	plugin.addCommand({
		id: 'new-deal',
		name: 'New deal',
		callback: () => openCreateModal(plugin, 'deal', contextValues(plugin, 'deal')),
	});
	plugin.addCommand({
		id: 'log-interaction',
		name: 'Log interaction',
		callback: () => openLogInteractionModal(plugin, contextValues(plugin, 'interaction')),
	});
}
