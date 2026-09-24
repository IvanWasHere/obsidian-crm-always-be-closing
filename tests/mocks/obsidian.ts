/**
 * Minimal runtime stand-in for the `obsidian` module (which only ships types).
 * Notes are stored as parsed frontmatter objects plus a body string, so the
 * metadata cache is always in sync. Extend as tests need more of the API.
 */
type Handler = (...args: unknown[]) => void;
export interface EventRef {
	emitter: Events;
	name: string;
	cb: Handler;
}

export class Events {
	private handlers = new Map<string, Set<Handler>>();

	on(name: string, cb: Handler): EventRef {
		if (!this.handlers.has(name)) this.handlers.set(name, new Set());
		this.handlers.get(name)!.add(cb);
		return { emitter: this, name, cb };
	}

	offref(ref: EventRef) {
		this.handlers.get(ref.name)?.delete(ref.cb);
	}

	trigger(name: string, ...args: unknown[]) {
		this.handlers.get(name)?.forEach((cb) => cb(...args));
	}
}

export abstract class TAbstractFile {
	constructor(public path: string) {}
	get name() {
		return this.path.split('/').pop()!;
	}
}

export class TFile extends TAbstractFile {
	/** ctime 0 means "unknown" to the index, so tests control `created` via frontmatter. */
	stat = { ctime: 0, mtime: 0, size: 0 };
	get basename() {
		return this.name.replace(/\.[^.]*$/, '');
	}
	get extension() {
		return this.name.includes('.') ? this.name.split('.').pop()! : '';
	}
}

export class TFolder extends TAbstractFile {}

type Frontmatter = Record<string, unknown>;
interface Note {
	file: TFile;
	frontmatter?: Frontmatter;
	body: string;
}

/** Parses the JSON frontmatter written by the mock `stringifyYaml`. */
function parseContent(content: string): { frontmatter?: Frontmatter; body: string } {
	const m = /^---\n([\s\S]*?)---\n?([\s\S]*)$/.exec(content);
	if (!m) return { body: content };
	return { frontmatter: JSON.parse(m[1]!) as Frontmatter, body: m[2]! };
}

export class Vault extends Events {
	notes = new Map<string, Note>();
	folders = new Set<string>();

	constructor(private app: App) {
		super();
	}

	getMarkdownFiles() {
		return [...this.notes.values()].map((n) => n.file).filter((f) => f.extension === 'md');
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		if (this.notes.has(path)) return this.notes.get(path)!.file;
		if (this.folders.has(path)) return new TFolder(path);
		return null;
	}

	async create(path: string, content: string) {
		if (this.notes.has(path)) throw new Error('File already exists.');
		return this.addNote(path, parseContent(content).frontmatter, parseContent(content).body);
	}

	getFileByPath(path: string): TFile | null {
		return this.notes.get(path)?.file ?? this.binaries.get(path)?.file ?? null;
	}

	async modify(file: TFile, content: string) {
		const note = this.notes.get(file.path)!;
		Object.assign(note, parseContent(content));
		this.app.metadataCache.trigger('changed', file);
	}

	/** Binary files (PDFs, images), kept apart from notes. */
	binaries = new Map<string, { file: TFile; data: ArrayBuffer }>();

	async readBinary(file: TFile): Promise<ArrayBuffer> {
		return this.binaries.get(file.path)!.data;
	}

	async createBinary(path: string, data: ArrayBuffer) {
		if (this.binaries.has(path) || this.notes.has(path)) throw new Error('File already exists.');
		const file = new TFile(path);
		this.binaries.set(path, { file, data });
		this.trigger('create', file);
		return file;
	}

	async modifyBinary(file: TFile, data: ArrayBuffer) {
		this.binaries.get(file.path)!.data = data;
	}

	async createFolder(path: string) {
		this.folders.add(path);
		return new TFolder(path);
	}

	/** Test helper: adds a note synchronously and fires the same events as Obsidian. */
	addNote(path: string, frontmatter?: Frontmatter, body = '') {
		const file = new TFile(path);
		this.notes.set(path, { file, frontmatter, body });
		this.trigger('create', file);
		this.app.metadataCache.trigger('changed', file);
		return file;
	}

	/** Test helper kept from the scaffold. */
	addFile(path: string) {
		return this.addNote(path);
	}

	/** Test helper: replaces a note's frontmatter. */
	setFrontmatter(path: string, frontmatter: Frontmatter) {
		const note = this.notes.get(path)!;
		note.frontmatter = frontmatter;
		this.app.metadataCache.trigger('changed', note.file);
	}

	deleteNote(path: string) {
		const note = this.notes.get(path)!;
		this.notes.delete(path);
		this.trigger('delete', note.file);
	}

	renameNote(oldPath: string, newPath: string) {
		const note = this.notes.get(oldPath)!;
		this.notes.delete(oldPath);
		note.file.path = newPath;
		this.notes.set(newPath, note);
		this.trigger('rename', note.file, oldPath);
	}

	/** Test helper: the TFile at a path; throws if missing. */
	file(path: string): TFile {
		const note = this.notes.get(path);
		if (!note) throw new Error(`No note at ${path}`);
		return note.file;
	}

	readNote(path: string) {
		return this.notes.get(path);
	}
}

export class MetadataCache extends Events {
	constructor(private app: App) {
		super();
	}

	getFileCache(file: TFile) {
		const note = this.app.vault.notes.get(file.path);
		return note ? { frontmatter: note.frontmatter } : null;
	}

	getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
		const withExt = /\.md$/i.test(linkpath) ? linkpath : `${linkpath}.md`;
		const files = this.app.vault.getMarkdownFiles();
		return (
			files.find((f) => f.path === withExt) ??
			files.find((f) => f.path.endsWith(`/${withExt}`) || f.name === withExt) ??
			null
		);
	}

	fileToLinktext(file: TFile, _sourcePath: string, omitMdExtension = true) {
		const clash = this.app.vault.getMarkdownFiles().filter((f) => f.basename === file.basename).length > 1;
		const text = clash ? file.path : file.name;
		return omitMdExtension ? text.replace(/\.md$/, '') : text;
	}
}

export class FileManager {
	constructor(private app: App) {}

	async processFrontMatter(file: TFile, fn: (fm: Frontmatter) => void) {
		const note = this.app.vault.notes.get(file.path);
		if (!note) throw new Error(`No note at ${file.path}`);
		const fm = structuredClone(note.frontmatter ?? {});
		fn(fm);
		note.frontmatter = fm;
		this.app.metadataCache.trigger('changed', file);
	}
}

export class Workspace extends Events {
	activeFile: TFile | null = null;
	/** Calls to openLinkText / openFile, for assertions. */
	opened: { path: string; newLeaf: unknown }[] = [];

	onLayoutReady(cb: () => void) {
		cb();
	}
	getActiveFile() {
		return this.activeFile;
	}
	/** Test helper: makes a note the active one and fires `file-open`. */
	setActiveFile(file: TFile | null) {
		this.activeFile = file;
		this.trigger('file-open', file);
	}
	async openLinkText(linktext: string, _sourcePath: string, newLeaf?: unknown) {
		this.opened.push({ path: linktext, newLeaf: newLeaf ?? false });
	}
	getLeaf() {
		return { openFile: async (file: TFile) => void this.opened.push({ path: file.path, newLeaf: false }) };
	}
}

export class App {
	vault: Vault = new Vault(this);
	metadataCache = new MetadataCache(this);
	fileManager = new FileManager(this);
	workspace = new Workspace();

	/** Paths only (no frontmatter), as in the scaffold tests. */
	constructor(files: string[] = []) {
		for (const path of files) {
			this.vault.notes.set(path, { file: new TFile(path), body: '' });
		}
	}
}

export const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

/** JSON is valid YAML, and the mock vault parses it back with JSON.parse. */
export const stringifyYaml = (obj: unknown) => `${JSON.stringify(obj)}\n`;

export class Keymap {
	static isModEvent(evt?: { metaKey?: boolean; ctrlKey?: boolean } | null) {
		return evt?.metaKey || evt?.ctrlKey ? 'tab' : false;
	}
}

export function setIcon(el: HTMLElement, icon: string) {
	el.dataset.icon = icon;
}

export class MenuItem {
	title = '';
	checked: boolean | null = null;
	click?: () => void;
	setTitle(title: string) {
		this.title = title;
		return this;
	}
	setChecked(checked: boolean | null) {
		this.checked = checked;
		return this;
	}
	setIcon() {
		return this;
	}
	onClick(cb: () => void) {
		this.click = cb;
		return this;
	}
}

export class Menu {
	/** The most recently shown menu, for assertions. */
	static shown: Menu | null = null;
	items: MenuItem[] = [];
	addItem(cb: (item: MenuItem) => void) {
		const item = new MenuItem();
		cb(item);
		this.items.push(item);
		return this;
	}
	addSeparator() {
		return this;
	}
	showAtMouseEvent() {
		Menu.shown = this;
		return this;
	}
	showAtPosition() {
		Menu.shown = this;
		return this;
	}
}

export class Modal {
	constructor(public app: App) {}
	setTitle() {
		return this;
	}
	open() {}
	close() {}
}

export const Platform = { isMobile: false, isDesktop: true, isPhone: false };

export class SuggestModal<T> extends Modal {
	setPlaceholder() {}
	getSuggestions(_query: string): T[] {
		return [];
	}
}

export class FuzzySuggestModal<T> extends SuggestModal<T> {}

export class Plugin {}
export class ItemView {}
export class PluginSettingTab {}
export class Setting {}

export class Notice {
	/** Messages shown so far, for assertions. */
	static shown: string[] = [];
	constructor(public message: string) {
		Notice.shown.push(message);
	}
}
