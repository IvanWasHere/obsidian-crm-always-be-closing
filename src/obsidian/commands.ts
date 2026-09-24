import type CrmPlugin from '../main';
import {
	ExportTypeModal,
	QuickLogModal,
	openCreateModal,
	openImportModal,
	openLogInteractionModal,
	openScheduleModal,
} from './modals';
import { contextValues } from './prefill';
import { exportAndOpenPdf } from './pdf';
import { exportMeetingIcs, exportUpcomingIcs } from './ics';
import {
	VIEW_TYPE_BILLING,
	VIEW_TYPE_CALENDAR,
	VIEW_TYPE_COMPANIES,
	VIEW_TYPE_CONTACTS,
	VIEW_TYPE_ENTITY_PANEL,
	VIEW_TYPE_HOME,
	VIEW_TYPE_PIPELINE,
	VIEW_TYPE_REPORTS,
} from './views';

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
		id: 'open-billing',
		name: 'Open invoices and quotes',
		callback: () => void plugin.activateView(VIEW_TYPE_BILLING),
	});
	plugin.addCommand({
		id: 'open-reports',
		name: 'Open reports',
		callback: () => void plugin.activateView(VIEW_TYPE_REPORTS),
	});
	plugin.addCommand({
		id: 'new-quote',
		name: 'New quote',
		callback: () => openCreateModal(plugin, 'quote', contextValues(plugin, 'billing')),
	});
	plugin.addCommand({
		id: 'new-invoice',
		name: 'New invoice',
		callback: () => openCreateModal(plugin, 'invoice', contextValues(plugin, 'billing')),
	});
	plugin.addCommand({
		id: 'open-calendar',
		name: 'Open calendar',
		callback: () => void plugin.activateView(VIEW_TYPE_CALENDAR),
	});
	plugin.addCommand({
		id: 'schedule-meeting',
		name: 'Schedule meeting',
		callback: () => openScheduleModal(plugin, contextValues(plugin, 'interaction')),
	});
	plugin.addCommand({
		id: 'export-meeting-ics',
		name: 'Add this meeting to my calendar (.ics)',
		checkCallback: (checking) => {
			const path = plugin.app.workspace.getActiveFile()?.path;
			const interaction = path ? plugin.index.getSnapshot().get(path, 'interaction') : undefined;
			if (!interaction?.date) return false;
			if (!checking) void exportMeetingIcs(plugin, interaction);
			return true;
		},
	});
	plugin.addCommand({
		id: 'export-upcoming-ics',
		name: 'Export upcoming meetings (.ics)',
		callback: () => void exportUpcomingIcs(plugin),
	});
	plugin.addCommand({
		id: 'export-pdf',
		name: 'Create PDF of this invoice or quote',
		checkCallback: (checking) => {
			const path = plugin.app.workspace.getActiveFile()?.path;
			const doc = path ? plugin.index.getSnapshot().get(path) : undefined;
			if (doc?.type !== 'invoice' && doc?.type !== 'quote') return false;
			if (!checking) void exportAndOpenPdf(plugin, doc);
			return true;
		},
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
		id: 'quick-log',
		name: 'Quick log interaction…',
		callback: () => new QuickLogModal(plugin).open(),
	});
	plugin.addCommand({
		id: 'import-contacts-csv',
		name: 'Import contacts from CSV…',
		callback: () => openImportModal(plugin),
	});
	plugin.addCommand({
		id: 'export-csv',
		name: 'Export to CSV…',
		callback: () => new ExportTypeModal(plugin).open(),
	});
	plugin.addCommand({
		id: 'log-interaction',
		name: 'Log interaction',
		callback: () => openLogInteractionModal(plugin, contextValues(plugin, 'interaction')),
	});
}
