import { TFile, normalizePath, stringifyYaml, type App } from 'obsidian';
import type { CrmSettings } from '../settings';
import type { CrmSnapshot } from './CrmSnapshot';
import { formatStageChange, parseStageHistory } from './billing';
import { addDays } from './dates';
import { fieldsFor, isEmptyValue, type FieldSpec, type FieldValue, type FieldValues, type LineItemInput, type PhaseInput } from './fields';
import { formatDate, typeFromTag, type Frontmatter } from './schema';
import { interactionTitle, sanitizeFileName } from './templates';
import {
	INTERACTION_KINDS,
	TYPE_TAGS,
	type EntityType,
	type InteractionKind,
	type QuoteStatus,
	type Quote,
} from './types';

/** Frontmatter edits: `null` or `undefined` removes the key. */
export type FrontmatterPatch = Record<string, unknown>;

type CreatableType = Exclude<EntityType, 'interaction'>;

const FOLDER_KEYS: Record<EntityType, keyof CrmSettings['folders']> = {
	contact: 'contacts',
	company: 'companies',
	project: 'projects',
	interaction: 'interactions',
	quote: 'quotes',
	invoice: 'invoices',
	requirement: 'requirements',
};

const text = (value: FieldValue | undefined) => (typeof value === 'string' ? value.trim() : '');
/** Vault paths from a `link`/`links` value. */
const paths = (value: FieldValue | undefined) =>
	Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const today = () => formatDate(new Date());

/**
 * Appends a stage change to `stage_history` unless it's already the latest entry.
 * With no history yet, `baseline` (the stage the project was in before, and since when)
 * is recorded first so the earlier stage isn't lost.
 */
function appendStage(fm: Frontmatter, stage: string, date: string, baseline?: { stage: string; since?: string }) {
	const history = parseStageHistory(fm.stage_history);
	if (history[history.length - 1]?.stage === stage) return;
	if (history.length === 0 && baseline?.since && baseline.stage !== stage) {
		history.push({ date: baseline.since, stage: baseline.stage });
	}
	history.push({ date, stage });
	fm.stage_history = history.map(formatStageChange);
}

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

	/**
	 * Creates a contact, company, project, quote or invoice note. Contacts,
	 * companies and projects need a `name`; quotes and invoices a `number`
	 * (their file is named `<number> <company>`).
	 */
	async createEntity(type: CreatableType, values: FieldValues, body = ''): Promise<TFile> {
		const settings = this.getSettings();
		const isBilling = type === 'quote' || type === 'invoice';
		const title = text(isBilling ? values.number : values.name);
		if (!title) throw new Error(isBilling ? 'Number is required' : 'Name is required');

		const defaults: FieldValues = {};
		if (type === 'contact') defaults.status = 'active';
		if (type === 'requirement') defaults.status = 'open';
		if (type === 'project') {
			defaults.stage = settings.pipelineStages[0] ?? 'lead';
			if (!isEmptyValue(values.value)) defaults.currency = settings.defaultCurrency;
		}
		if (isBilling) {
			defaults.status = 'draft';
			defaults.currency = settings.defaultCurrency;
		}

		const companyPath = paths(values.company)[0];
		const company = isBilling && companyPath ? this.fileAt(companyPath)?.basename : undefined;
		const path = await this.newPath(settings.folders[FOLDER_KEYS[type]], company ? `${title} ${company}` : title);

		const fm = this.frontmatter(type, { ...defaults, ...withoutEmpty(values) }, path);
		const date = today();
		fm.created = date;
		if (type === 'project') appendStage(fm, fm.stage as string, date);
		return this.createNote(path, fm, body);
	}

	/**
	 * Creates an interaction note and moves `last_contacted` forward on every
	 * linked contact, except for plain notes (not a touchpoint) and scheduled
	 * interactions dated in the future (they haven't happened yet).
	 */
	async logInteraction(values: FieldValues, body = ''): Promise<TFile> {
		const kind = (INTERACTION_KINDS as readonly string[]).includes(values.kind as string)
			? (values.kind as InteractionKind)
			: 'note';
		const date = typeof values.date === 'string' && values.date ? values.date : formatDate(new Date());
		const contactPaths = paths(values.contacts);
		const names = contactPaths.map((p) => this.fileAt(p)?.basename ?? '').filter(Boolean);

		const path = await this.newPath(this.getSettings().folders.interactions, interactionTitle(kind, date, names));
		const fm = this.frontmatter('interaction', { ...withoutEmpty(values), kind, date }, path);
		const file = await this.createNote(path, fm, body);

		if (kind !== 'note' && date <= today()) {
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

	/**
	 * Sets one field from a UI value; an empty value removes the key.
	 * For `links`/`assets` fields, `keepLinks` are link targets to keep as they are
	 * (links the UI can't show because they don't point at a CRM note).
	 */
	setField(path: string, spec: FieldSpec, value: FieldValue | undefined, keepLinks: string[] = []): Promise<void> {
		if ((spec.kind === 'links' || spec.kind === 'assets') && keepLinks.length > 0) {
			const links = [...(this.toFrontmatter(spec, value ?? [], path) as string[]), ...keepLinks.map((l) => `[[${l}]]`)];
			return this.updateFields(path, { [spec.key]: links });
		}
		return this.updateFields(path, {
			[spec.key]: isEmptyValue(value) ? null : this.toFrontmatter(spec, value!, path),
		});
	}

	/**
	 * Sets or removes raw frontmatter fields (snake_case keys, as stored).
	 * Changing a project's `stage` also appends to its `stage_history`.
	 */
	async updateFields(path: string, patch: FrontmatterPatch): Promise<void> {
		const file = this.fileAt(path);
		if (!file) throw new Error(`Note not found: ${path}`);
		await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
			const previousStage = fm.stage;
			for (const [key, value] of Object.entries(patch)) {
				if (value === undefined || value === null) delete fm[key];
				else fm[key] = value;
			}
			// Writing `project` supersedes the pre-rename `deal` key.
			if ('project' in patch) delete fm.deal;
			if (typeFromTag(fm.type) === 'project' && typeof patch.stage === 'string') {
				const since = typeof fm.created === 'string' ? fm.created : undefined;
				appendStage(fm, patch.stage, today(), typeof previousStage === 'string' ? { stage: previousStage, since } : undefined);
			}
		});
	}

	moveProjectStage(path: string, stage: string): Promise<void> {
		return this.updateFields(path, { stage });
	}

	/**
	 * Records a stage change made outside the plugin (e.g. by editing
	 * frontmatter). `previous` is what the index knew before the edit.
	 */
	async recordStage(path: string, stage: string, previous?: { stage: string; since?: string }): Promise<void> {
		const file = this.fileAt(path);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
			if (fm.stage === stage) appendStage(fm, stage, today(), previous);
		});
	}

	/**
	 * Marks a quote or invoice as sent. Fills in a missing issue date (today)
	 * and a missing due date / valid-until date from the billing settings.
	 */
	async markSent(path: string): Promise<void> {
		const { billing } = this.getSettings();
		await this.processFile(path, (fm) => {
			fm.status = 'sent';
			const issued = typeof fm.issued === 'string' && fm.issued ? fm.issued : today();
			fm.issued = issued;
			if (fm.type === TYPE_TAGS.invoice && !fm.due) fm.due = addDays(issued, billing.paymentTermsDays);
			if (fm.type === TYPE_TAGS.quote && !fm.valid_until) fm.valid_until = addDays(issued, billing.quoteValidityDays);
		});
	}

	async markPaid(path: string, date = today()): Promise<void> {
		await this.processFile(path, (fm) => {
			fm.status = 'paid';
			fm.paid_on = date;
		});
	}

	setQuoteStatus(path: string, status: QuoteStatus): Promise<void> {
		return this.updateFields(path, { status });
	}

	/**
	 * Creates a draft invoice from a quote (same company, contact, project,
	 * currency and line items, linked back to the quote) and marks the
	 * quote accepted if it was still open.
	 */
	async convertQuoteToInvoice(quote: Quote, crm: CrmSnapshot, number: string): Promise<TFile> {
		const { billing } = this.getSettings();
		const issued = today();
		const file = await this.createEntity('invoice', {
			number,
			company: crm.linkedPaths(quote.path, 'company'),
			contact: crm.linkedPaths(quote.path, 'contact'),
			project: crm.linkedPaths(quote.path, 'project'),
			quote: [quote.path],
			issued,
			due: addDays(issued, billing.paymentTermsDays),
			currency: quote.currency,
			items: quote.items.map((i) => ({
				description: i.description,
				qty: String(i.qty),
				price: String(i.price),
				tax: String(i.tax),
			})),
		});
		if (quote.status === 'draft' || quote.status === 'sent') await this.setQuoteStatus(quote.path, 'accepted');
		return file;
	}

	private async processFile(path: string, fn: (fm: Frontmatter) => void): Promise<void> {
		const file = this.fileAt(path);
		if (!file) throw new Error(`Note not found: ${path}`);
		await this.app.fileManager.processFrontMatter(file, fn);
	}

	/** Frontmatter in field order (built-in, then custom), with `type` first. */
	private frontmatter(type: EntityType, values: FieldValues, sourcePath: string): Frontmatter {
		const fm: Frontmatter = { type: TYPE_TAGS[type] };
		for (const spec of fieldsFor(type, this.getSettings())) {
			const value = values[spec.key];
			if (!isEmptyValue(value)) fm[spec.key] = this.toFrontmatter(spec, value!, sourcePath);
		}
		return fm;
	}

	/** Converts a UI value to what gets stored: numbers, tag lists, wikilinks, line items. */
	private toFrontmatter(spec: FieldSpec, value: FieldValue, sourcePath: string): unknown {
		if (spec.kind === 'items') return toLineItems(value as LineItemInput[]);
		if (spec.kind === 'phases') return toPhases(value as PhaseInput[]);
		const list = (Array.isArray(value) ? value : [value]) as string[];
		switch (spec.kind) {
			case 'link':
				return this.link(list[0]!, sourcePath);
			case 'links':
			case 'assets':
				return list.map((p) => this.link(p, sourcePath));
			case 'tags':
				return list
					.flatMap((t) => t.split(','))
					.map((t) => t.trim().replace(/^#/, ''))
					.filter(Boolean);
			case 'checkbox':
				return list[0] === 'true';
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

/** Line items as stored: numbers parsed, blank rows dropped. Throws on a non-numeric cell. */
function toLineItems(rows: LineItemInput[]): { description: string; qty: number; price: number; tax: number }[] {
	const num = (value: string, label: string, row: number, fallback: number) => {
		if (value.trim() === '') return fallback;
		const n = Number(value.replace(/[\s_]/g, '').replace(',', '.'));
		if (!Number.isFinite(n)) throw new Error(`Line ${row}: ${label} should be a number`);
		return n;
	};
	return rows
		.filter((r) => r.description.trim() !== '' || r.price.trim() !== '')
		.map((r, i) => ({
			description: r.description.trim(),
			qty: num(r.qty, 'quantity', i + 1, 1),
			price: num(r.price, 'price', i + 1, 0),
			tax: num(r.tax, 'tax', i + 1, 0),
		}));
}

/** Phases as stored: unnamed rows dropped, `done` only when true. */
function toPhases(rows: PhaseInput[]): { name: string; deadline?: string; done?: boolean }[] {
	return rows
		.filter((r) => r.name.trim() !== '')
		.map((r) => ({
			name: r.name.trim(),
			...(r.deadline ? { deadline: r.deadline } : {}),
			...(r.done === 'true' ? { done: true } : {}),
		}));
}

function withoutEmpty(values: FieldValues): FieldValues {
	return Object.fromEntries(Object.entries(values).filter(([, v]) => !isEmptyValue(v)));
}
