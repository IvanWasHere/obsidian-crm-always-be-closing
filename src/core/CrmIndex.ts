import { TFile, type App, type EventRef, type Events } from 'obsidian';
import type { CrmSettings } from '../settings';
import { CrmSnapshot } from './CrmSnapshot';
import { parseEntity, typeFromTag, type Frontmatter } from './schema';
import type { Entity, EntityType } from './types';

const FOLDER_TYPES: [keyof CrmSettings['folders'], EntityType][] = [
	['contacts', 'contact'],
	['companies', 'company'],
	['deals', 'deal'],
	['interactions', 'interaction'],
	['quotes', 'quote'],
	['invoices', 'invoice'],
];

/**
 * Decides whether a note is a CRM entity. The `type` field wins; notes with
 * no `type` inside a configured CRM folder get the folder's type.
 */
export function classify(path: string, fm: Frontmatter | undefined, settings: CrmSettings): EntityType | null {
	if (!path.toLowerCase().endsWith('.md')) return null;
	if (fm?.type !== undefined && fm.type !== null) return typeFromTag(fm.type);
	for (const [key, type] of FOLDER_TYPES) {
		const folder = settings.folders[key];
		if (folder && path.startsWith(`${folder}/`)) return type;
	}
	return null;
}

/**
 * In-memory index of CRM entities, built from Obsidian's metadata cache
 * (never from file contents) and kept up to date through vault events.
 * Changes are batched and published as a new immutable CrmSnapshot.
 */
export class CrmIndex {
	private entities = new Map<string, Entity>();
	private snapshot = CrmSnapshot.empty;
	private listeners = new Set<() => void>();
	private events: [Events, EventRef][] = [];

	private dirty = new Set<string>();
	private fullRescan = false;
	private relinkNeeded = false;
	private timer: number | null = null;

	/**
	 * Called when a deal already in the index changes stage (from any source,
	 * including manual frontmatter edits). Not called for the initial scan.
	 */
	onDealStageChange?: (path: string, stage: string, previous: { stage: string; since?: string }) => void;

	constructor(
		private app: App,
		private getSettings: () => CrmSettings,
		private debounceMs = 200,
	) {}

	/** Scans the vault and starts listening for changes. Call once the layout is ready. */
	load() {
		const { vault, metadataCache } = this.app;
		this.listen(metadataCache, metadataCache.on('changed', (file) => this.markDirty(file.path)));
		this.listen(vault, vault.on('create', (file) => this.markDirty(file.path)));
		this.listen(
			vault,
			vault.on('delete', (file) => {
				this.markDirty(file.path);
				this.relinkNeeded = true;
			}),
		);
		this.listen(
			vault,
			vault.on('rename', (file, oldPath) => {
				this.markDirty(oldPath);
				this.markDirty(file.path);
				// A rename can change what other notes' links resolve to.
				this.relinkNeeded = true;
			}),
		);
		this.fullRescan = true;
		this.flush();
	}

	unload() {
		this.cancelTimer();
		for (const [emitter, ref] of this.events) emitter.offref(ref);
		this.events = [];
		this.listeners.clear();
	}

	/** Re-reads every note, e.g. after folders or stages change in settings. */
	requestRescan() {
		this.fullRescan = true;
		this.schedule();
	}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): CrmSnapshot => this.snapshot;

	/** Applies pending changes now instead of waiting for the debounce. */
	flush() {
		this.cancelTimer();
		const changed = this.fullRescan ? this.rescan() : this.applyDirty();
		this.dirty.clear();
		this.fullRescan = false;
		if (!changed && !this.relinkNeeded) return;
		this.relinkNeeded = false;
		this.publish();
	}

	private listen(emitter: Events, ref: EventRef) {
		this.events.push([emitter, ref]);
	}

	private markDirty(path: string) {
		this.dirty.add(path);
		this.schedule();
	}

	private schedule() {
		if (this.timer !== null) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.flush();
		}, this.debounceMs);
	}

	private cancelTimer() {
		if (this.timer === null) return;
		window.clearTimeout(this.timer);
		this.timer = null;
	}

	private rescan(): boolean {
		this.entities.clear();
		for (const file of this.app.vault.getMarkdownFiles()) this.indexFile(file);
		return true;
	}

	private applyDirty(): boolean {
		let changed = false;
		for (const path of this.dirty) {
			const file = this.app.vault.getAbstractFileByPath(path);
			const before = this.entities.get(path);
			const had = this.entities.delete(path);
			const has = file instanceof TFile && this.indexFile(file);
			changed ||= had || has;

			const after = this.entities.get(path);
			if (before?.type === 'deal' && after?.type === 'deal' && before.stage !== after.stage) {
				this.onDealStageChange?.(path, after.stage, { stage: before.stage, since: before.created });
			}
		}
		return changed;
	}

	/** Returns true if the file is a CRM entity and was added to the index. */
	private indexFile(file: TFile): boolean {
		const settings = this.getSettings();
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const type = classify(file.path, fm, settings);
		if (!type) return false;
		this.entities.set(
			file.path,
			parseEntity(type, file.path, fm, { stages: settings.pipelineStages }, file.stat.ctime),
		);
		return true;
	}

	private publish() {
		const { metadataCache } = this.app;
		this.snapshot = new CrmSnapshot(
			new Map(this.entities),
			(link, source) => metadataCache.getFirstLinkpathDest(link.linkpath, source)?.path ?? null,
			this.snapshot.version + 1,
		);
		for (const listener of this.listeners) listener();
	}
}
