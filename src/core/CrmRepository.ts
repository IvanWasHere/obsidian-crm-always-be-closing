import { TFile, normalizePath, stringifyYaml, type App } from 'obsidian';
import type { CrmSettings } from '../settings';
import { formatDate, type Frontmatter } from './schema';
import {
	companyFrontmatter,
	contactFrontmatter,
	dealFrontmatter,
	interactionFrontmatter,
	interactionTitle,
	sanitizeFileName,
	type CompanyFields,
	type ContactFields,
	type DealFields,
	type InteractionFields,
} from './templates';
import type { DateString } from './types';

/** Relations are given as vault paths of the related notes. */
export type NewContact = Omit<ContactFields, 'company'> & { company?: string; body?: string };
export type NewCompany = CompanyFields & { body?: string };
export type NewDeal = Omit<DealFields, 'company' | 'contacts' | 'stage' | 'currency'> & {
	company?: string;
	contacts?: string[];
	stage?: string;
	currency?: string;
	body?: string;
};
export type NewInteraction = Omit<InteractionFields, 'contacts' | 'deal' | 'date'> & {
	date?: DateString;
	contacts?: string[];
	deal?: string;
	body?: string;
};

/** Frontmatter edits: `null` or `undefined` removes the key. */
export type FrontmatterPatch = Record<string, unknown>;

/**
 * The only place that writes CRM data to the vault. New notes are created
 * with complete frontmatter in one write; edits go through
 * `fileManager.processFrontMatter` so the rest of the note is untouched.
 */
export class CrmRepository {
	constructor(
		private app: App,
		private getSettings: () => CrmSettings,
	) {}

	async createContact(input: NewContact): Promise<TFile> {
		const path = await this.newPath(this.getSettings().folders.contacts, input.name);
		const fm = contactFrontmatter({ ...input, company: this.link(input.company, path) });
		return this.createNote(path, fm, input.body);
	}

	async createCompany(input: NewCompany): Promise<TFile> {
		const path = await this.newPath(this.getSettings().folders.companies, input.name);
		return this.createNote(path, companyFrontmatter(input), input.body);
	}

	async createDeal(input: NewDeal): Promise<TFile> {
		const settings = this.getSettings();
		const path = await this.newPath(settings.folders.deals, input.name);
		const fm = dealFrontmatter({
			...input,
			company: this.link(input.company, path),
			contacts: this.links(input.contacts, path),
			stage: input.stage ?? settings.pipelineStages[0] ?? 'lead',
			currency: input.value !== undefined ? (input.currency ?? settings.defaultCurrency) : input.currency,
		});
		return this.createNote(path, fm, input.body);
	}

	/**
	 * Creates an interaction note and moves `last_contacted` forward on every
	 * linked contact (except for plain notes, which aren't a touchpoint).
	 */
	async logInteraction(input: NewInteraction): Promise<TFile> {
		const date = input.date ?? formatDate(new Date());
		const contactPaths = input.contacts ?? [];
		const names = contactPaths.map((p) => this.fileAt(p)?.basename ?? '').filter(Boolean);
		const path = await this.newPath(this.getSettings().folders.interactions, interactionTitle(input.kind, date, names));
		const fm = interactionFrontmatter({
			...input,
			date,
			contacts: this.links(contactPaths, path),
			deal: this.link(input.deal, path),
		});
		const file = await this.createNote(path, fm, input.body);

		if (input.kind !== 'note') {
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

	/** Sets or removes frontmatter fields (snake_case keys, as stored). */
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

	private fileAt(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	/** `[[Linktext]]` for a note, written the shortest way that still resolves from `sourcePath`. */
	private link(targetPath: string | undefined, sourcePath: string): string | undefined {
		if (!targetPath) return undefined;
		const file = this.fileAt(targetPath);
		const text = file
			? this.app.metadataCache.fileToLinktext(file, sourcePath, true)
			: targetPath.replace(/\.md$/i, '');
		return `[[${text}]]`;
	}

	private links(targetPaths: string[] | undefined, sourcePath: string): string[] {
		return (targetPaths ?? []).map((p) => this.link(p, sourcePath)!);
	}

	private async createNote(path: string, fm: Frontmatter, body = ''): Promise<TFile> {
		const content = `---\n${stringifyYaml(fm)}---\n${body}`;
		return this.app.vault.create(path, content);
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
