import { Plugin } from 'obsidian';
import { CrmSettingTab, CrmSettings, mergeSettings } from './settings';
import {
	BillingItemView,
	CalendarItemView,
	CompaniesItemView,
	ContactsItemView,
	EntityPanelItemView,
	HomeItemView,
	PipelineItemView,
	ReportsItemView,
	VIEW_TYPE_BILLING,
	VIEW_TYPE_CALENDAR,
	VIEW_TYPE_COMPANIES,
	VIEW_TYPE_CONTACTS,
	VIEW_TYPE_ENTITY_PANEL,
	VIEW_TYPE_HOME,
	VIEW_TYPE_PIPELINE,
	VIEW_TYPE_REPORTS,
} from './obsidian/views';
import { registerCommands } from './obsidian/commands';
import { CrmIndex } from './core/CrmIndex';
import { CrmRepository } from './core/CrmRepository';

export default class CrmPlugin extends Plugin {
	/** Live settings; the settings tab edits this object in place. */
	settings!: CrmSettings;
	index!: CrmIndex;
	/** Immutable copy of `settings`, replaced on every save, for React (see useSettings). */
	private settingsSnapshot!: CrmSettings;
	private settingsListeners = new Set<() => void>();
	repo!: CrmRepository;

	async onload() {
		await this.loadSettings();

		const getSettings = () => this.settings;
		this.index = new CrmIndex(this.app, getSettings);
		this.repo = new CrmRepository(this.app, getSettings);
		// Record stage changes made by editing frontmatter directly, for lead and win/loss stats.
		this.index.onDealStageChange = (path, stage, previous) => {
			void this.repo.recordStage(path, stage, previous);
		};
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
		this.registerView(VIEW_TYPE_BILLING, (leaf) => new BillingItemView(leaf, this));
		this.registerView(VIEW_TYPE_REPORTS, (leaf) => new ReportsItemView(leaf, this));
		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarItemView(leaf, this));

		this.addRibbonIcon('contact', 'Open CRM dashboard', () => {
			void this.activateView(VIEW_TYPE_HOME);
		});

		registerCommands(this);
		this.addSettingTab(new CrmSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
		this.settingsSnapshot = structuredClone(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.settingsSnapshot = structuredClone(this.settings);
		for (const listener of this.settingsListeners) listener();
		// Folders and stages affect what gets indexed and how it's validated.
		this.index.requestRescan();
	}

	subscribeSettings = (listener: () => void): (() => void) => {
		this.settingsListeners.add(listener);
		return () => this.settingsListeners.delete(listener);
	};

	getSettingsSnapshot = (): CrmSettings => this.settingsSnapshot;

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
