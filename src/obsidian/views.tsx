import { ReactItemView } from './ReactItemView';
import { DashboardView } from '../ui/views/DashboardView';
import { PipelineView } from '../ui/views/PipelineView';
import { CompaniesView } from '../ui/views/CompaniesView';
import { ContactsView } from '../ui/views/ContactsView';
import { EntityPanel } from '../ui/views/EntityPanel';

export const VIEW_TYPE_HOME = 'always-be-closing-home';
export const VIEW_TYPE_CONTACTS = 'always-be-closing-contacts';
export const VIEW_TYPE_ENTITY_PANEL = 'always-be-closing-entity-panel';
export const VIEW_TYPE_PIPELINE = 'always-be-closing-pipeline';
export const VIEW_TYPE_COMPANIES = 'always-be-closing-companies';

/** The dashboard. Keeps the original `home` view type so saved workspaces still open it. */
export class HomeItemView extends ReactItemView {
	getViewType() {
		return VIEW_TYPE_HOME;
	}
	getDisplayText() {
		return 'CRM';
	}
	getIcon() {
		return 'contact';
	}
	protected renderView() {
		return <DashboardView />;
	}
}

export class ContactsItemView extends ReactItemView {
	getViewType() {
		return VIEW_TYPE_CONTACTS;
	}
	getDisplayText() {
		return 'Contacts';
	}
	getIcon() {
		return 'users';
	}
	protected renderView() {
		return <ContactsView />;
	}
}

export class PipelineItemView extends ReactItemView {
	getViewType() {
		return VIEW_TYPE_PIPELINE;
	}
	getDisplayText() {
		return 'Pipeline';
	}
	getIcon() {
		return 'kanban-square';
	}
	protected renderView() {
		return <PipelineView />;
	}
}

export class CompaniesItemView extends ReactItemView {
	getViewType() {
		return VIEW_TYPE_COMPANIES;
	}
	getDisplayText() {
		return 'Companies';
	}
	getIcon() {
		return 'building-2';
	}
	protected renderView() {
		return <CompaniesView />;
	}
}

/** Right-sidebar panel showing the CRM details of the active note. */
export class EntityPanelItemView extends ReactItemView {
	getViewType() {
		return VIEW_TYPE_ENTITY_PANEL;
	}
	getDisplayText() {
		return 'CRM details';
	}
	getIcon() {
		return 'id-card';
	}
	protected renderView() {
		return <EntityPanel />;
	}
}
