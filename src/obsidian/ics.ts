import { FileSystemAdapter, Notice, Platform, normalizePath, type TFile } from 'obsidian';
import type CrmPlugin from '../main';
import { formatDate } from '../core/schema';
import { toIcs } from '../core/ics';
import type { Interaction } from '../core/types';

/**
 * Opens a vault file with the system's default app (desktop only), e.g. an
 * .ics file in the calendar app, which then offers to add the event.
 */
function openWithSystem(plugin: CrmPlugin, file: TFile): boolean {
	const adapter = plugin.app.vault.adapter;
	if (!Platform.isDesktopApp || !(adapter instanceof FileSystemAdapter)) return false;
	const electron = (window as unknown as { require?: (id: string) => unknown }).require?.('electron') as
		| { shell?: { openPath(path: string): Promise<string> } }
		| undefined;
	if (!electron?.shell) return false;
	void electron.shell.openPath(adapter.getFullPath(file.path));
	return true;
}

async function writeText(plugin: CrmPlugin, path: string, content: string): Promise<TFile> {
	const { vault } = plugin.app;
	const existing = vault.getFileByPath(path);
	if (existing) {
		await vault.modify(existing, content);
		return existing;
	}
	return vault.create(path, content);
}

/** Writes `<note>.ics` next to the interaction and opens it in the calendar app on desktop. */
export async function exportMeetingIcs(plugin: CrmPlugin, interaction: Interaction): Promise<TFile | undefined> {
	if (!interaction.date) {
		new Notice('Give the meeting a date first.');
		return undefined;
	}
	const file = await writeText(plugin, interaction.path.replace(/\.md$/i, '.ics'), toIcs([interaction], plugin.index.getSnapshot()));
	if (!openWithSystem(plugin, file)) new Notice(`Saved ${file.path}. Open it to add the meeting to your calendar.`);
	return file;
}

/** Writes all meetings from today on into one .ics file in the Exports folder. */
export async function exportUpcomingIcs(plugin: CrmPlugin): Promise<TFile | undefined> {
	const today = formatDate(new Date());
	const upcoming = plugin.index
		.getSnapshot()
		.all('interaction')
		.filter((i) => i.date !== undefined && i.date >= today && (i.kind === 'meeting' || i.time || i.date > today));
	if (upcoming.length === 0) {
		new Notice('No upcoming meetings to export.');
		return undefined;
	}
	const { vault } = plugin.app;
	const root = plugin.settings.folders.contacts.split('/').slice(0, -1).join('/') || 'CRM';
	const folder = normalizePath(`${root}/Exports`);
	if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
	const file = await writeText(plugin, `${folder}/upcoming meetings ${today}.ics`, toIcs(upcoming, plugin.index.getSnapshot()));
	if (!openWithSystem(plugin, file)) new Notice(`Saved ${upcoming.length} meetings to ${file.path}.`);
	return file;
}
