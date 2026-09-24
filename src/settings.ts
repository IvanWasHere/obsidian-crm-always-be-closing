import { App, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import type CrmPlugin from './main';

export interface CrmFolders {
	contacts: string;
	companies: string;
	deals: string;
	interactions: string;
}

export interface CrmSettings {
	/** Bumped when the frontmatter format changes, to drive migrations. */
	schemaVersion: number;
	folders: CrmFolders;
	pipelineStages: string[];
	defaultCurrency: string;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: CrmSettings = {
	schemaVersion: CURRENT_SCHEMA_VERSION,
	folders: {
		contacts: 'CRM/Contacts',
		companies: 'CRM/Companies',
		deals: 'CRM/Deals',
		interactions: 'CRM/Interactions',
	},
	pipelineStages: ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
	defaultCurrency: 'EUR',
};

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
	};
}

export function parseStages(value: string): string[] {
	const stages = value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return [...new Set(stages)];
}

const FOLDER_LABELS: Record<keyof CrmFolders, string> = {
	contacts: 'Contacts folder',
	companies: 'Companies folder',
	deals: 'Deals folder',
	interactions: 'Interactions folder',
};

export class CrmSettingTab extends PluginSettingTab {
	plugin: CrmPlugin;

	constructor(app: App, plugin: CrmPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
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
			.setDesc('Currency code for new deals, e.g. EUR or USD.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.defaultCurrency)
					.setValue(settings.defaultCurrency)
					.onChange(async (value) => {
						settings.defaultCurrency = value.trim().toUpperCase() || DEFAULT_SETTINGS.defaultCurrency;
						await this.plugin.saveSettings();
					}),
			);
	}
}
