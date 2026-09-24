import { Plugin } from 'obsidian';
import { CrmSettingTab, CrmSettings, mergeSettings } from './settings';
import { CrmHomeView, VIEW_TYPE_CRM_HOME } from './obsidian/CrmHomeView';
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
		this.app.workspace.onLayoutReady(() => this.index.load());
		this.register(() => this.index.unload());

		this.registerView(VIEW_TYPE_CRM_HOME, (leaf) => new CrmHomeView(leaf, this));

		this.addRibbonIcon('contact', 'Open CRM', () => {
			void this.activateHomeView();
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

	async activateHomeView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CRM_HOME)[0];
		const leaf = existing ?? workspace.getLeaf('tab');
		if (!existing) {
			await leaf.setViewState({ type: VIEW_TYPE_CRM_HOME, active: true });
		}
		await workspace.revealLeaf(leaf);
	}
}
