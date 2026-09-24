import type CrmPlugin from '../main';
import type { CrmSnapshot } from '../core/CrmSnapshot';
import type { FieldValues } from '../core/fields';
import type { Entity } from '../core/types';

/** Which form is being pre-filled. `billing` covers quotes and invoices. */
export type PrefillForm = 'contact' | 'deal' | 'interaction' | 'billing';

/**
 * Pre-fills forms from the active note: e.g. "New deal" on a company note
 * links the company, "Log interaction" on a deal links the deal and its contacts.
 */
export function contextValues(plugin: CrmPlugin, form: PrefillForm): FieldValues {
	const path = plugin.app.workspace.getActiveFile()?.path;
	const crm = plugin.index.getSnapshot();
	const entity = path ? crm.get(path) : undefined;
	return entity ? valuesFrom(entity, crm, form) : {};
}

/** Form values that link a new note to `entity` (and to what it links to, where that helps). */
export function valuesFrom(entity: Entity, crm: CrmSnapshot, form: PrefillForm): FieldValues {
	switch (entity.type) {
		case 'company':
			return form === 'interaction' ? {} : { company: [entity.path] };
		case 'contact': {
			const company = crm.linkedPaths(entity.path, 'company');
			if (form === 'contact') return { company };
			if (form === 'billing') return { contact: [entity.path], company };
			return { contacts: [entity.path], ...(form === 'deal' ? { company } : {}) };
		}
		case 'deal': {
			const company = crm.linkedPaths(entity.path, 'company');
			const contacts = crm.linkedPaths(entity.path, 'contacts');
			if (form === 'interaction') return { deal: [entity.path], contacts };
			if (form === 'billing') return { deal: [entity.path], company, contact: contacts.slice(0, 1) };
			return { company };
		}
		case 'interaction':
		case 'quote':
		case 'invoice':
			return {};
	}
}
