import { TFile, normalizePath, stringifyYaml, type App } from 'obsidian';
import type { CrmSettings } from '../settings';
import { FIELDS, isEmptyValue, type FieldSpec, type FieldValue, type FieldValues } from './fields';
import { formatDate, type Frontmatter } from './schema';
import { interactionTitle, sanitizeFileName } from './templates';
import { INTERACTION_KINDS, TYPE_TAGS, type EntityType, type InteractionKind } from './types';

/** Frontmatter edits: `null` or `undefined` removes the key. */
export type FrontmatterPatch = Record<string, unknown>;

type CreatableType = Exclude<EntityType, 'interaction'>;

const FOLDER_KEYS: Record<EntityType, keyof CrmSettings['folders']> = {
	contact: 'contacts',
	company: 'companies',
	deal: 'deals',
	interaction: 'interactions',
};

/**
 * The only place that writes CRM data to the vault. New notes are created
 * with complete frontmatter in one write; edits go through
 * `fileManager.processFrontMatter` so the rest of the note is untouched.
 *
 * Values come in as FieldValues keyed by frontmatter key, with vault paths
 * for relations; they are converted to wikilinks here.
 */
export class CrmRepository {
	constructor(
		private app: App,
		private getSettings: () => CrmSettings,
	) {}

	/** Creates a contact, company or deal note. `name` is required. */
	async createEntity(type: CreatableType, values: FieldValues, body = ''): Promise<TFile> {
		const settings = this.getSettings();
		const name = typeof values.name === 'string' ? values.name.trim() : '';
		if (!name) throw new Error('Name is required');

		const defaults: FieldValues = {};
		if (type === 'contact') defaults.status = 'active';
		if (type === 'deal') {
			defaults.stage = settings.pipelineStages[0] ?? 'lead';
			if (!isEmptyValue(values.value)) defaults.currency = settings.defaultCurrency;
		}

		const path = await this.newPath(settings.folders[FOLDER_KEYS[type]], name);
		const fm = this.frontmatter(type, { ...defaults, ...withoutEmpty(values) }, path);
		return this.createNote(path, fm, body);
	}

	/**
	 * Creates an interaction note and moves `last_contacted` forward on every
	 * linked contact (except for plain notes, which aren't a touchpoint).
	 */
	async logInteraction(values: FieldValues, body = ''): Promise<TFile> {
		const kind = (INTERACTION_KINDS as readonly string[]).includes(values.kind as string)
			? (values.kind as InteractionKind)
			: 'note';
		const date = typeof values.date === 'string' && values.date ? values.date : formatDate(new Date());
		const contactPaths = Array.isArray(values.contacts) ? values.contacts : [];
		const names = contactPaths.map((p) => this.fileAt(p)?.basename ?? '').filter(Boolean);

		const path = await this.newPath(this.getSettings().folders.interactions, interactionTitle(kind, date, names));
		const fm = this.frontmatter('interaction', { ...withoutEmpty(values), kind, date }, path);
		const file = await this.createNote(path, fm, body);

		if (kind !== 'note') {
			for (const contactPath of contactPaths) {
				const contact = this.fileAt(contactPath);
				if (!contact) continue;
				await this.app.fileManager.processFrontMatter(contact, (cfm: Frontmatter) => {
					const current = cfm.last_contacted;
					if (typeof current !== 'string' || current.slice(0, 10) < date) cfm.last_contacted = date;
				});
			}
		}
		return file;
	}

	/** Sets one field from a UI value; an empty value removes the key. */
	setField(path: string, spec: FieldSpec, value: FieldValue | undefined): Promise<void> {
		return this.updateFields(path, {
			[spec.key]: isEmptyValue(value) ? null : this.toFrontmatter(spec, value!, path),
		});
	}

	/** Sets or removes raw frontmatter fields (snake_case keys, as stored). */
	async updateFields(path: string, patch: FrontmatterPatch): Promise<void> {
		const file = this.fileAt(path);
		if (!file) throw new Error(`Note not found: ${path}`);
		await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
			for (const [key, value] of Object.entries(patch)) {
				if (value === undefined || value === null) delete fm[key];
				else fm[key] = value;
			}
		});
	}

	moveDealStage(path: string, stage: string): Promise<void> {
		return this.updateFields(path, { stage });
	}

	/** Frontmatter in FIELDS order, with `type` first. */
	private frontmatter(type: EntityType, values: FieldValues, sourcePath: string): Frontmatter {
		const fm: Frontmatter = { type: TYPE_TAGS[type] };
		for (const spec of FIELDS[type]) {
			const value = values[spec.key];
			if (!isEmptyValue(value)) fm[spec.key] = this.toFrontmatter(spec, value!, sourcePath);
		}
		return fm;
	}

	/** Converts a UI value to what gets stored: numbers, tag lists, wikilinks. */
	private toFrontmatter(spec: FieldSpec, value: FieldValue, sourcePath: string): unknown {
		const list = Array.isArray(value) ? value : [value];
		switch (spec.kind) {
			case 'link':
				return this.link(list[0]!, sourcePath);
			case 'links':
				return list.map((p) => this.link(p, sourcePath));
			case 'tags':
				return list
					.flatMap((t) => t.split(','))
					.map((t) => t.trim().replace(/^#/, ''))
					.filter(Boolean);
			case 'number': {
				const n = Number(String(list[0]).replace(/[\s,_]/g, ''));
				if (!Number.isFinite(n)) throw new Error(`${spec.label} should be a number`);
				return n;
			}
			default:
				return String(list[0]).trim();
		}
	}

	private fileAt(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	/** `[[Linktext]]` for a note, written the shortest way that still resolves from `sourcePath`. */
	private link(targetPath: string, sourcePath: string): string {
		const file = this.fileAt(targetPath);
		const text = file
			? this.app.metadataCache.fileToLinktext(file, sourcePath, true)
			: targetPath.replace(/\.md$/i, '');
		return `[[${text}]]`;
	}

	private async createNote(path: string, fm: Frontmatter, body: string): Promise<TFile> {
		return this.app.vault.create(path, `---\n${stringifyYaml(fm)}---\n${body}`);
	}

	/** A free path `folder/Name.md`, adding ` 2`, ` 3`… on clashes. Creates the folder if needed. */
	private async newPath(folder: string, name: string): Promise<string> {
		const { vault } = this.app;
		const dir = normalizePath(folder);
		if (dir && !vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
		const base = sanitizeFileName(name) || 'Untitled';
		const prefix = dir ? `${dir}/` : '';
		let path = normalizePath(`${prefix}${base}.md`);
		for (let n = 2; vault.getAbstractFileByPath(path); n++) {
			path = normalizePath(`${prefix}${base} ${n}.md`);
		}
		return path;
	}
}

function withoutEmpty(values: FieldValues): FieldValues {
	return Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmptyValue(v)));
}
