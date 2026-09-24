import { Plugin } from 'obsidian';
import { CrmSettingTab, CrmSettings, mergeSettings } from './settings';
import {
	CompaniesItemView,
	ContactsItemView,
	EntityPanelItemView,
	HomeItemView,
	PipelineItemView,
	VIEW_TYPE_COMPANIES,
	VIEW_TYPE_CONTACTS,
	VIEW_TYPE_ENTITY_PANEL,
	VIEW_TYPE_HOME,
	VIEW_TYPE_PIPELINE,
} from './obsidian/views';
import { registerCommands } from './obsidian/commands';
import { CrmIndex } from './core/CrmIndex';
import { CrmRepository } from './core/CrmRepository';

export default class CrmPlugin extends Plugin {
	settings!: CrmSettings;
	index!: CrmIndex;
	repo!: CrmRepository;

	async onload() {
		await this.loadSettings();

		const getSettings = () => this.settings;
		this.index = new CrmIndex(this.app, getSettings);
		this.repo = new CrmRepository(this.app, getSettings);
		this.app.workspace.onLayoutReady(() => {
			this.index.load();
			// Keep the details panel docked in the right sidebar without stealing focus.
			void this.app.workspace.ensureSideLeaf(VIEW_TYPE_ENTITY_PANEL, 'right', { active: false, reveal: false });
		});
		this.register(() => this.index.unload());

		this.registerView(VIEW_TYPE_HOME, (leaf) => new HomeItemView(leaf, this));
		this.registerView(VIEW_TYPE_CONTACTS, (leaf) => new ContactsItemView(leaf, this));
		this.registerView(VIEW_TYPE_ENTITY_PANEL, (leaf) => new EntityPanelItemView(leaf, this));
		this.registerView(VIEW_TYPE_PIPELINE, (leaf) => new PipelineItemView(leaf, this));
		this.registerView(VIEW_TYPE_COMPANIES, (leaf) => new CompaniesItemView(leaf, this));

		this.addRibbonIcon('contact', 'Open CRM dashboard', () => {
			void this.activateView(VIEW_TYPE_HOME);
		});

		registerCommands(this);
		this.addSettingTab(new CrmSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Folders and stages affect what gets indexed and how it's validated.
		this.index.requestRescan();
	}

	/** Focuses an existing view of this type, or opens one in a new tab or the right sidebar. */
	async activateView(type: string, where: 'tab' | 'right' = 'tab') {
		const { workspace } = this.app;
		if (where === 'right') {
			await workspace.ensureSideLeaf(type, 'right', { active: true, reveal: true });
			return;
		}
		const existing = workspace.getLeavesOfType(type)[0];
		const leaf = existing ?? workspace.getLeaf('tab');
		if (!existing) await leaf.setViewState({ type, active: true });
		await workspace.revealLeaf(leaf);
	}
}
