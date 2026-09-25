import { Notice, TFile, normalizePath } from 'obsidian';
import type CrmPlugin from '../main';
import { typeFromTag, type Frontmatter } from '../core/schema';
import { CURRENT_SCHEMA_VERSION } from '../settings';

export interface LegacyCounts {
	/** Notes with `type: crm-deal`. */
	deals: TFile[];
	/** CRM notes that still link with `deal:`. */
	dealLinks: TFile[];
}

/** Notes still in the pre-projects format, read from the metadata cache. */
export function findLegacyNotes(plugin: CrmPlugin): LegacyCounts {
	const { vault, metadataCache } = plugin.app;
	const result: LegacyCounts = { deals: [], dealLinks: [] };
	for (const file of vault.getMarkdownFiles()) {
		const fm = metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) continue;
		if (fm.type === 'crm-deal') result.deals.push(file);
		if (fm.deal !== undefined && typeFromTag(fm.type) !== null) result.dealLinks.push(file);
	}
	return result;
}

/**
 * Converts deals to projects: `type: crm-deal` → `crm-project`, `deal:` →
 * `project:` on interactions, quotes and invoices, and moves notes out of the
 * old deals folder into the projects folder. Moves go through Obsidian's
 * file manager, so links to them are updated.
 */
export async function migrateDealsToProjects(plugin: CrmPlugin): Promise<{ projects: number; links: number; moved: number }> {
	const { app, settings } = plugin;
	const legacy = findLegacyNotes(plugin);
	let moved = 0;

	for (const file of legacy.dealLinks) {
		await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
			if (fm.project === undefined) fm.project = fm.deal;
			delete fm.deal;
		});
	}
	for (const file of legacy.deals) {
		await app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
			fm.type = 'crm-project';
		});
	}

	const from = settings.legacyDealsFolder ? normalizePath(settings.legacyDealsFolder) : undefined;
	const to = normalizePath(settings.folders.projects);
	if (from && from !== to) {
		if (!app.vault.getAbstractFileByPath(to)) await app.vault.createFolder(to);
		for (const file of legacy.deals) {
			if (!file.path.startsWith(`${from}/`)) continue;
			let target = normalizePath(`${to}/${file.name}`);
			for (let n = 2; app.vault.getAbstractFileByPath(target); n++) target = normalizePath(`${to}/${file.basename} ${n}.md`);
			await app.fileManager.renameFile(file, target);
			moved++;
		}
	}

	settings.schemaVersion = CURRENT_SCHEMA_VERSION;
	delete settings.legacyDealsFolder;
	await plugin.saveSettings();
	return { projects: legacy.deals.length, links: legacy.dealLinks.length, moved };
}

export async function runMigration(plugin: CrmPlugin): Promise<void> {
	try {
		const r = await migrateDealsToProjects(plugin);
		new Notice(
			r.projects + r.links === 0
				? 'Nothing to migrate: all notes already use projects.'
				: `Migrated ${r.projects} deals to projects (${r.moved} moved to ${plugin.settings.folders.projects}) and updated ${r.links} links.`,
		);
	} catch (err) {
		new Notice(`Migration stopped: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Once per startup: point out old-format notes and the command that converts them. */
export function remindAboutMigration(plugin: CrmPlugin): void {
	const legacy = findLegacyNotes(plugin);
	const count = legacy.deals.length + legacy.dealLinks.length;
	if (count === 0) return;
	new Notice(
		`Always Be Closing: deals are now projects. ${count} notes still use the old format. ` +
			'Run "Migrate deals to projects" from the command palette to update them.',
		15000,
	);
}
