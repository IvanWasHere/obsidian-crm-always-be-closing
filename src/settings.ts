import { App, PluginSettingTab, Setting, normalizePath, type TextComponent } from 'obsidian';
import type CrmPlugin from './main';
import { CUSTOM_FIELD_KINDS, customFieldProblem, slugifyKey, type CustomField } from './core/fields';
import { ENTITY_TYPES, type EntityType } from './core/types';

export interface CrmFolders {
	contacts: string;
	companies: string;
	deals: string;
	interactions: string;
	quotes: string;
	invoices: string;
}

export interface BillingSettings {
	invoicePrefix: string;
	quotePrefix: string;
	/** Days from issue date to due date for new invoices. */
	paymentTermsDays: number;
	/** Days a new quote stays valid. */
	quoteValidityDays: number;
	/** Tax percentage pre-filled on new line items. */
	defaultTaxRate: number;
	/** Your business, printed as the sender on PDFs. Multi-line fields use newlines. */
	businessName: string;
	businessAddress: string;
	businessEmail: string;
	businessPhone: string;
	businessTaxId: string;
	/** e.g. bank name, IBAN, BIC. Printed on invoices. */
	bankDetails: string;
	/** Closing note on invoices, e.g. "Please pay within 30 days." */
	paymentNote: string;
	/** Vault path of a PNG or JPEG logo for PDFs. */
	logoPath: string;
}

export interface CrmSettings {
	/** Bumped when the frontmatter format changes, to drive migrations. */
	schemaVersion: number;
	folders: CrmFolders;
	pipelineStages: string[];
	defaultCurrency: string;
	/** Active contacts with no interaction for this many days show up as stale. */
	staleAfterDays: number;
	/** User-defined frontmatter fields per entity type. */
	customFields: Record<EntityType, CustomField[]>;
	billing: BillingSettings;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: CrmSettings = {
	schemaVersion: CURRENT_SCHEMA_VERSION,
	folders: {
		contacts: 'CRM/Contacts',
		companies: 'CRM/Companies',
		deals: 'CRM/Deals',
		interactions: 'CRM/Interactions',
		quotes: 'CRM/Quotes',
		invoices: 'CRM/Invoices',
	},
	pipelineStages: ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
	defaultCurrency: 'EUR',
	staleAfterDays: 30,
	customFields: { contact: [], company: [], deal: [], interaction: [], quote: [], invoice: [] },
	billing: {
		invoicePrefix: 'INV-',
		quotePrefix: 'Q-',
		paymentTermsDays: 30,
		quoteValidityDays: 30,
		defaultTaxRate: 0,
		businessName: '',
		businessAddress: '',
		businessEmail: '',
		businessPhone: '',
		businessTaxId: '',
		bankDetails: '',
		paymentNote: '',
		logoPath: '',
	},
};

function mergeBilling(saved: unknown): BillingSettings {
	const data = (saved && typeof saved === 'object' ? saved : {}) as Partial<BillingSettings>;
	const d = DEFAULT_SETTINGS.billing;
	const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
	const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
	return {
		invoicePrefix: text(data.invoicePrefix, d.invoicePrefix),
		quotePrefix: text(data.quotePrefix, d.quotePrefix),
		paymentTermsDays: Math.round(num(data.paymentTermsDays, d.paymentTermsDays)),
		quoteValidityDays: Math.round(num(data.quoteValidityDays, d.quoteValidityDays)),
		defaultTaxRate: num(data.defaultTaxRate, d.defaultTaxRate),
		businessName: text(data.businessName, d.businessName),
		businessAddress: text(data.businessAddress, d.businessAddress),
		businessEmail: text(data.businessEmail, d.businessEmail),
		businessPhone: text(data.businessPhone, d.businessPhone),
		businessTaxId: text(data.businessTaxId, d.businessTaxId),
		bankDetails: text(data.bankDetails, d.bankDetails),
		paymentNote: text(data.paymentNote, d.paymentNote),
		logoPath: text(data.logoPath, d.logoPath),
	};
}

function mergeCustomFields(saved: unknown): Record<EntityType, CustomField[]> {
	const data = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
	const result = {} as Record<EntityType, CustomField[]>;
	for (const type of ENTITY_TYPES) {
		const list = Array.isArray(data[type]) ? (data[type] as Partial<CustomField>[]) : [];
		result[type] = list
			.filter((f) => f && typeof f.key === 'string')
			.map((f) => ({
				key: f.key!,
				label: typeof f.label === 'string' ? f.label : f.key!,
				kind: (CUSTOM_FIELD_KINDS as readonly string[]).includes(f.kind as string) ? f.kind! : 'text',
				...(Array.isArray(f.options) ? { options: f.options.filter((o): o is string => typeof o === 'string') } : {}),
				...(f.showInTable ? { showInTable: true } : {}),
			}));
	}
	return result;
}

/** Merges saved data over the defaults, ignoring values of the wrong shape. */
export function mergeSettings(saved: unknown): CrmSettings {
	const data = (saved && typeof saved === 'object' ? saved : {}) as Partial<CrmSettings>;
	const folders = { ...DEFAULT_SETTINGS.folders };
	for (const key of Object.keys(folders) as (keyof CrmFolders)[]) {
		const value = data.folders?.[key];
		if (typeof value === 'string' && value.trim()) folders[key] = value;
	}
	const stages = Array.isArray(data.pipelineStages)
		? data.pipelineStages.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
		: [];
	return {
		schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : CURRENT_SCHEMA_VERSION,
		folders,
		pipelineStages: stages.length > 0 ? stages : [...DEFAULT_SETTINGS.pipelineStages],
		defaultCurrency:
			typeof data.defaultCurrency === 'string' && data.defaultCurrency.trim()
				? data.defaultCurrency
				: DEFAULT_SETTINGS.defaultCurrency,
		staleAfterDays:
			typeof data.staleAfterDays === 'number' && data.staleAfterDays > 0
				? Math.round(data.staleAfterDays)
				: DEFAULT_SETTINGS.staleAfterDays,
		customFields: mergeCustomFields(data.customFields),
		billing: mergeBilling(data.billing),
	};
}

export function parseStages(value: string): string[] {
	const stages = value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return [...new Set(stages)];
}

const CUSTOM_FIELD_HEADINGS: Record<EntityType, string> = {
	contact: 'Contact fields',
	company: 'Company fields',
	deal: 'Deal fields',
	interaction: 'Interaction fields',
	quote: 'Quote fields',
	invoice: 'Invoice fields',
};

const FOLDER_LABELS: Record<keyof CrmFolders, string> = {
	contacts: 'Contacts folder',
	companies: 'Companies folder',
	deals: 'Deals folder',
	interactions: 'Interactions folder',
	quotes: 'Quotes folder',
	invoices: 'Invoices folder',
};

export class CrmSettingTab extends PluginSettingTab {
	plugin: CrmPlugin;

	constructor(app: App, plugin: CrmPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.render();
	}

	/** Redraws the whole tab (used after adding, removing or retyping a custom field). */
	private render(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;
		containerEl.empty();

		new Setting(containerEl).setName('Folders').setHeading();

		for (const key of Object.keys(FOLDER_LABELS) as (keyof CrmFolders)[]) {
			new Setting(containerEl)
				.setName(FOLDER_LABELS[key])
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.folders[key])
						.setValue(settings.folders[key])
						.onChange(async (value) => {
							settings.folders[key] = value.trim()
								? normalizePath(value.trim())
								: DEFAULT_SETTINGS.folders[key];
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl).setName('Deals').setHeading();

		new Setting(containerEl)
			.setName('Pipeline stages')
			.setDesc('Comma-separated, in pipeline order.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.pipelineStages.join(', '))
					.setValue(settings.pipelineStages.join(', '))
					.onChange(async (value) => {
						const stages = parseStages(value);
						settings.pipelineStages = stages.length > 0 ? stages : [...DEFAULT_SETTINGS.pipelineStages];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default currency')
			.setDesc('Used for new deals that have a value.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.defaultCurrency)
					.setValue(settings.defaultCurrency)
					.onChange(async (value) => {
						settings.defaultCurrency = value.trim().toUpperCase() || DEFAULT_SETTINGS.defaultCurrency;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Invoices and quotes').setHeading();
		const billing = settings.billing;
		const prefixSetting = (name: string, key: 'invoicePrefix' | 'quotePrefix') =>
			new Setting(containerEl)
				.setName(name)
				.setDesc('Numbers look like <prefix><year>-0001 and restart every year.')
				.addText((text) =>
					text.setValue(billing[key]).onChange(async (value) => {
						billing[key] = value.trim();
						await this.plugin.saveSettings();
					}),
				);
		prefixSetting('Invoice number prefix', 'invoicePrefix');
		prefixSetting('Quote number prefix', 'quotePrefix');
		const numberSetting = (
			name: string,
			desc: string,
			key: 'paymentTermsDays' | 'quoteValidityDays' | 'defaultTaxRate',
		) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((text) =>
					text
						.setPlaceholder(String(DEFAULT_SETTINGS.billing[key]))
						.setValue(String(billing[key]))
						.onChange(async (value) => {
							const n = Number(value.replace(',', '.'));
							billing[key] = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.billing[key];
							await this.plugin.saveSettings();
						}),
				);
		numberSetting('Payment terms (days)', 'Due date of a new invoice, counted from its issue date.', 'paymentTermsDays');
		numberSetting('Quote validity (days)', 'How long a new quote stays valid.', 'quoteValidityDays');
		numberSetting('Default tax rate (%)', 'Pre-filled on new line items.', 'defaultTaxRate');

		new Setting(containerEl)
			.setName('Your business')
			.setDesc('Printed as the sender on every invoice and quote PDF.')
			.setHeading();
		type BusinessKey =
			| 'businessName'
			| 'businessAddress'
			| 'businessEmail'
			| 'businessPhone'
			| 'businessTaxId'
			| 'bankDetails'
			| 'paymentNote'
			| 'logoPath';
		const businessSetting = (name: string, key: BusinessKey, multiline = false, desc?: string) => {
			const setting = new Setting(containerEl).setName(name);
			if (desc) setting.setDesc(desc);
			const onChange = async (value: string) => {
				billing[key] = multiline ? value.replace(/\s+$/, '') : value.trim();
				await this.plugin.saveSettings();
			};
			if (multiline) setting.addTextArea((t) => t.setValue(billing[key]).onChange(onChange));
			else setting.addText((t) => t.setValue(billing[key]).onChange(onChange));
		};
		businessSetting('Business name', 'businessName');
		businessSetting('Address', 'businessAddress', true);
		businessSetting('Email', 'businessEmail');
		businessSetting('Phone', 'businessPhone');
		businessSetting('Tax ID', 'businessTaxId', false, 'VAT or other tax number.');
		businessSetting('Bank details', 'bankDetails', true, 'Printed on invoices, e.g. bank, IBAN and BIC on separate lines.');
		businessSetting('Payment note', 'paymentNote', true, 'Closing note on invoices.');
		businessSetting('Logo', 'logoPath', false, 'Vault path of a PNG or JPEG image, e.g. CRM/logo.png.');

		new Setting(containerEl).setName('Follow-ups').setHeading();

		new Setting(containerEl)
			.setName('Stale after (days)')
			.setDesc('Active contacts with no interaction for this long, and no follow-up scheduled, are listed as stale on the dashboard.')
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.staleAfterDays))
					.setValue(String(settings.staleAfterDays))
					.onChange(async (value) => {
						const days = Number(value);
						settings.staleAfterDays =
							Number.isFinite(days) && days > 0 ? Math.round(days) : DEFAULT_SETTINGS.staleAfterDays;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Custom fields')
			.setDesc('Extra frontmatter fields shown in forms, the details panel and CSV import/export. Existing notes are not changed.')
			.setHeading();

		for (const type of ENTITY_TYPES) this.displayCustomFields(containerEl, type);
	}

	private displayCustomFields(containerEl: HTMLElement, type: EntityType) {
		const fields = this.plugin.settings.customFields[type];
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl)
			.setName(CUSTOM_FIELD_HEADINGS[type])
			.addButton((b) =>
				b.setButtonText('Add field').onClick(async () => {
					fields.push({ key: '', label: '', kind: 'text' });
					await save();
					this.render();
				}),
			);

		fields.forEach((field, i) => {
			const row = new Setting(containerEl).setClass('abc-custom-field');
			const describe = () => {
				const problem = customFieldProblem(type, field, fields);
				row.setDesc(problem ?? `Frontmatter key: ${field.key}`);
				row.descEl.toggleClass('mod-warning', problem !== null);
			};
			let keyInput: TextComponent | undefined;

			row.addText((t) =>
				t
					.setPlaceholder('Label')
					.setValue(field.label)
					.onChange(async (value) => {
						// Keep the key in step with the label until it's edited by hand.
						const autoKey = !field.key || field.key === slugifyKey(field.label);
						field.label = value;
						if (autoKey) {
							field.key = slugifyKey(value);
							keyInput?.setValue(field.key);
						}
						describe();
						await save();
					}),
			);
			row.addText((t) => {
				keyInput = t;
				t.setPlaceholder('Key')
					.setValue(field.key)
					.onChange(async (value) => {
						field.key = value.trim();
						describe();
						await save();
					});
			});
			row.addDropdown((d) => {
				for (const kind of CUSTOM_FIELD_KINDS) d.addOption(kind, kind);
				d.setValue(field.kind).onChange(async (value) => {
					field.kind = value as CustomField['kind'];
					await save();
					this.render();
				});
			});
			if (field.kind === 'select') {
				row.addText((t) =>
					t
						.setPlaceholder('Options, comma-separated')
						.setValue((field.options ?? []).join(', '))
						.onChange(async (value) => {
							field.options = parseStages(value);
							await save();
						}),
				);
			}
			if (type === 'contact' || type === 'company') {
				row.addToggle((t) =>
					t
						.setTooltip('Show as a column in the table')
						.setValue(field.showInTable === true)
						.onChange(async (value) => {
							field.showInTable = value || undefined;
							await save();
						}),
				);
			}
			row.addExtraButton((b) =>
				b
					.setIcon('trash-2')
					.setTooltip('Remove field')
					.onClick(async () => {
						fields.splice(i, 1);
						await save();
						this.render();
					}),
			);
			describe();
		});
	}
}
