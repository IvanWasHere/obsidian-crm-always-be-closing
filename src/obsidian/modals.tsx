import { FuzzySuggestModal, Notice, SuggestModal, normalizePath, type FuzzyMatch } from 'obsidian';
import type CrmPlugin from '../main';
import { exportTable } from '../core/csvExport';
import { nextNumber } from '../core/billing';
import { addDays } from '../core/dates';
import type { FieldValues } from '../core/fields';
import { isClosedStage } from '../core/insights';
import { formatDate } from '../core/schema';
import type { Entity, EntityType } from '../core/types';
import { EntityForm } from '../ui/components/EntityForm';
import { ImportContacts } from '../ui/views/ImportContacts';
import { toCsv } from '../utils/csv';
import { valuesFrom } from './prefill';
import { ReactModal } from './ReactModal';

const TITLES: Record<Exclude<EntityType, 'interaction'>, string> = {
	contact: 'New contact',
	company: 'New company',
	deal: 'New deal',
	quote: 'New quote',
	invoice: 'New invoice',
};

/** Starting values for a new quote or invoice: next number, dates from settings, one empty line. */
export function billingDefaults(plugin: CrmPlugin, type: 'quote' | 'invoice'): FieldValues {
	const { billing, defaultCurrency } = plugin.settings;
	const today = formatDate(new Date());
	return {
		number: nextNumber(plugin.index.getSnapshot(), type, plugin.settings, today),
		status: 'draft',
		issued: today,
		...(type === 'invoice'
			? { due: addDays(today, billing.paymentTermsDays) }
			: { valid_until: addDays(today, billing.quoteValidityDays) }),
		currency: defaultCurrency,
		items: [{ description: '', qty: '1', price: '', tax: String(billing.defaultTaxRate) }],
	};
}

/** Opens a form for a new contact, company, deal, quote or invoice, then opens the created note. */
export function openCreateModal(plugin: CrmPlugin, type: Exclude<EntityType, 'interaction'>, initial: FieldValues = {}) {
	const defaults = type === 'quote' || type === 'invoice' ? billingDefaults(plugin, type) : {};
	new ReactModal(plugin, TITLES[type], (close) => (
		<EntityForm
			type={type}
			initial={{ ...defaults, ...initial }}
			submitLabel="Create"
			onSubmit={async (values, body) => {
				const file = await plugin.repo.createEntity(type, values, body);
				close();
				await plugin.app.workspace.getLeaf(false).openFile(file);
			}}
		/>
	)).open();
}

/**
 * Opens the "log interaction" form. Stays on the current note afterwards.
 * `fields` limits the visible fields (quick log shows only kind and summary).
 */
export function openLogInteractionModal(
	plugin: CrmPlugin,
	initial: FieldValues = {},
	options: { title?: string; fields?: string[] } = {},
) {
	new ReactModal(plugin, options.title ?? 'Log interaction', (close) => (
		<EntityForm
			type="interaction"
			initial={{ kind: 'call', date: formatDate(new Date()), ...initial }}
			fields={options.fields}
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

/**
 * Quick capture: fuzzy-pick a contact or open deal, then log with only
 * kind, summary and notes (date is today; links are filled in).
 */
export class QuickLogModal extends FuzzySuggestModal<Entity> {
	constructor(private plugin: CrmPlugin) {
		super(plugin.app);
		this.setPlaceholder('Log an interaction with…');
	}

	getItems(): Entity[] {
		const crm = this.plugin.index.getSnapshot();
		return [
			...crm.all('contact').filter((c) => c.status !== 'archived'),
			...crm.all('deal').filter((d) => !isClosedStage(d.stage)),
		];
	}

	getItemText(entity: Entity): string {
		return entity.name;
	}

	renderSuggestion(match: FuzzyMatch<Entity>, el: HTMLElement) {
		super.renderSuggestion(match, el);
		const company = this.plugin.index.getSnapshot().companyOf(match.item.path)?.name;
		el.createEl('small', {
			cls: 'abc-suggestion-note',
			text: [match.item.type === 'deal' ? 'Deal' : 'Contact', company].filter(Boolean).join(' · '),
		});
	}

	onChooseItem(entity: Entity) {
		const crm = this.plugin.index.getSnapshot();
		openLogInteractionModal(this.plugin, valuesFrom(entity, crm, 'interaction'), {
			title: `Log interaction: ${entity.name}`,
			fields: ['kind', 'summary'],
		});
	}
}

const EXPORT_LABELS: Record<EntityType, string> = {
	contact: 'Contacts',
	company: 'Companies',
	deal: 'Deals',
	interaction: 'Interactions',
	quote: 'Quotes',
	invoice: 'Invoices',
};

/** Picks an entity type, then writes its CSV into an `Exports` folder next to the CRM folders. */
export class ExportTypeModal extends SuggestModal<EntityType> {
	constructor(private plugin: CrmPlugin) {
		super(plugin.app);
		this.setPlaceholder('Export which notes to CSV?');
	}

	getSuggestions(query: string): EntityType[] {
		const q = query.toLowerCase();
		return (Object.keys(EXPORT_LABELS) as EntityType[]).filter((t) => EXPORT_LABELS[t].toLowerCase().includes(q));
	}

	renderSuggestion(type: EntityType, el: HTMLElement) {
		const count = this.plugin.index.getSnapshot().count(type);
		el.createDiv({ text: EXPORT_LABELS[type] });
		el.createEl('small', { cls: 'abc-suggestion-note', text: `${count} notes` });
	}

	onChooseSuggestion(type: EntityType) {
		exportCsv(this.plugin, type).catch((err: unknown) => {
			new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}
}

/** Writes `<CRM root>/Exports/<type> <date>.csv`, replacing an export from the same day. */
export async function exportCsv(plugin: CrmPlugin, type: EntityType): Promise<string> {
	const { vault } = plugin.app;
	const table = exportTable(type, plugin.index.getSnapshot(), plugin.settings);
	const root = plugin.settings.folders.contacts.split('/').slice(0, -1).join('/') || 'CRM';
	const folder = normalizePath(`${root}/Exports`);
	if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);

	const path = normalizePath(`${folder}/${EXPORT_LABELS[type].toLowerCase()} ${formatDate(new Date())}.csv`);
	const content = toCsv(table);
	const existing = vault.getFileByPath(path);
	if (existing) await vault.modify(existing, content);
	else await vault.create(path, content);

	new Notice(`Exported ${table.length - 1} ${EXPORT_LABELS[type].toLowerCase()} to ${path}`);
	return path;
}

export function openImportModal(plugin: CrmPlugin) {
	new ReactModal(plugin, 'Import contacts from CSV', (close) => <ImportContacts onDone={close} />).open();
}
