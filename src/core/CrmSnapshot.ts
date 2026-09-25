import type {
	Company,
	Contact,
	Project,
	Entity,
	EntityOfType,
	EntityType,
	Interaction,
	Invoice,
	Quote,
	Requirement,
	Wikilink,
} from './types';

/**
 * Link fields per entity type: frontmatter key (same as the entity property)
 * and the entity type it must point at, or `file` for any vault file.
 * Drives relation building.
 */
const LINK_FIELDS: Record<EntityType, [key: string, target: EntityType | 'file'][]> = {
	contact: [['company', 'company']],
	company: [],
	project: [
		['company', 'company'],
		['contacts', 'contact'],
		['assets', 'file'],
	],
	requirement: [['project', 'project']],
	interaction: [
		['contacts', 'contact'],
		['project', 'project'],
	],
	quote: [
		['company', 'company'],
		['contact', 'contact'],
		['project', 'project'],
	],
	invoice: [
		['company', 'company'],
		['contact', 'contact'],
		['project', 'project'],
		['quote', 'quote'],
	],
};

/** Resolves a link written in `sourcePath` to a vault path, or null if it points nowhere. */
export type LinkResolver = (link: Wikilink, sourcePath: string) => string | null;

const EMPTY: readonly never[] = Object.freeze([]);

function byName(a: Entity, b: Entity) {
	return a.name.localeCompare(b.name);
}

/** Newest first; undated interactions last. */
function byDateDesc(a: Interaction, b: Interaction) {
	return (b.date ?? '').localeCompare(a.date ?? '') || byName(a, b);
}

/** Quotes and invoices: newest issue date first, then highest number. */
function byIssuedDesc(a: Quote | Invoice, b: Quote | Invoice) {
	return (b.issued ?? b.created ?? '').localeCompare(a.issued ?? a.created ?? '') || byName(b, a);
}

function push(map: Map<string, Entity[]>, key: string, value: Entity) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/**
 * Immutable view of all CRM entities with resolved relationships.
 * CrmIndex creates a new snapshot whenever something changes, so React can
 * compare snapshots by identity.
 */
export class CrmSnapshot {
	private readonly byType: { [T in EntityType]: EntityOfType<T>[] } = {
		contact: [],
		company: [],
		project: [],
		interaction: [],
		quote: [],
		invoice: [],
		requirement: [],
	};
	/** entity path → link field key → resolved target paths. */
	private readonly forward = new Map<string, Record<string, string[]>>();
	/** entity path → links that don't point at a CRM note of the expected type. */
	private readonly unresolved = new Map<string, { key: string; linkpath: string }[]>();
	/** target path → entities that link to it. */
	private readonly reverse = new Map<string, Entity[]>();

	static readonly empty = new CrmSnapshot(new Map(), () => null, 0);

	constructor(
		readonly entities: ReadonlyMap<string, Entity>,
		resolve: LinkResolver,
		readonly version: number,
	) {
		for (const entity of entities.values()) {
			(this.byType[entity.type] as Entity[]).push(entity);
		}
		for (const list of Object.values(this.byType)) list.sort(byName);
		this.byType.interaction.sort(byDateDesc);
		this.byType.quote.sort(byIssuedDesc);
		this.byType.invoice.sort(byIssuedDesc);

		// Visit in sorted order so every reverse list comes out sorted too.
		for (const type of ['contact', 'project', 'interaction', 'quote', 'invoice', 'requirement'] as const) {
			for (const entity of this.byType[type]) {
				const refs: Record<string, string[]> = {};
				for (const [key, targetType] of LINK_FIELDS[type]) {
					const raw = (entity as unknown as Record<string, Wikilink | Wikilink[] | undefined>)[key];
					const links = Array.isArray(raw) ? raw : raw ? [raw] : [];
					const paths = new Set<string>();
					for (const link of links) {
						// Only keep links that point at indexed entities of the expected type;
						// remember the rest so the UI can point them out.
						const path = resolve(link, entity.path);
						if (path && (targetType === 'file' || entities.get(path)?.type === targetType)) {
							paths.add(path);
						} else {
							const list = this.unresolved.get(entity.path) ?? [];
							list.push({ key, linkpath: link.linkpath });
							this.unresolved.set(entity.path, list);
						}
					}
					refs[key] = [...paths];
					// Assets point at files, not CRM notes: nothing to look up in reverse.
					if (targetType !== 'file') for (const p of paths) push(this.reverse, p, entity);
				}
				this.forward.set(entity.path, refs);
			}
		}
	}

	get<T extends EntityType>(path: string, type?: T): EntityOfType<T> | undefined {
		const entity = this.entities.get(path);
		if (!entity || (type && entity.type !== type)) return undefined;
		return entity as EntityOfType<T>;
	}

	/** All entities of a type. Sorted by name; interactions by date, newest first. */
	all<T extends EntityType>(type: T): readonly EntityOfType<T>[] {
		return this.byType[type];
	}

	count(type: EntityType): number {
		return this.byType[type].length;
	}

	/** Resolved paths of a link field (e.g. `company`, `contacts`, `project`) on an entity. */
	linkedPaths(path: string, key: string): string[] {
		return [...(this.forward.get(path)?.[key] ?? [])];
	}

	/** Link targets in a field that don't resolve to a CRM note of the right type. */
	unresolvedLinks(path: string, key: string): string[] {
		return (this.unresolved.get(path) ?? []).filter((u) => u.key === key).map((u) => u.linkpath);
	}

	/** The company a contact, project, quote or invoice links to. */
	companyOf(path: string): Company | undefined {
		const target = this.forward.get(path)?.company?.[0];
		return target ? this.get(target, 'company') : undefined;
	}

	/** The project an interaction, quote or invoice links to. */
	projectOf(path: string): Project | undefined {
		const target = this.forward.get(path)?.project?.[0];
		return target ? this.get(target, 'project') : undefined;
	}

	/** The quote an invoice was made from. */
	quoteOf(path: string): Quote | undefined {
		const target = this.forward.get(path)?.quote?.[0];
		return target ? this.get(target, 'quote') : undefined;
	}

	/** Contacts on a project, interaction, quote or invoice, or the contacts of a company. */
	contactsOf(path: string): readonly Contact[] {
		if (this.entities.get(path)?.type === 'company') return this.linking(path, 'contact');
		const refs = this.forward.get(path);
		const own = refs?.contacts ?? refs?.contact ?? [];
		return own.map((p) => this.get(p, 'contact')!);
	}

	/** Quotes linking to a company, contact or project, newest first. */
	quotesOf(path: string): readonly Quote[] {
		return this.linking(path, 'quote');
	}

	/** Requirements of a project (unsorted; see sortRequirements). */
	requirementsOf(path: string): readonly Requirement[] {
		return this.linking(path, 'requirement');
	}

	/** Invoices linking to a company, contact, project or quote, newest first. */
	invoicesOf(path: string): readonly Invoice[] {
		return this.linking(path, 'invoice');
	}

	/** Projects of a company, or projects a contact is on. */
	projectsOf(path: string): readonly Project[] {
		return this.linking(path, 'project');
	}

	/**
	 * Interactions involving a contact or project, newest first. For a company,
	 * this rolls up interactions of its contacts and projects.
	 */
	interactionsOf(path: string): readonly Interaction[] {
		const entity = this.entities.get(path);
		if (entity?.type !== 'company') return this.linking(path, 'interaction');
		const seen = new Set<Interaction>();
		for (const related of [...this.linking(path, 'contact'), ...this.linking(path, 'project')]) {
			for (const i of this.linking(related.path, 'interaction')) seen.add(i);
		}
		return [...seen].sort(byDateDesc);
	}

	/** Entities of `type` that link to `path`. */
	private linking<T extends EntityType>(path: string, type: T): readonly EntityOfType<T>[] {
		const list = this.reverse.get(path);
		if (!list) return EMPTY;
		return list.filter((e): e is EntityOfType<T> => e.type === type);
	}
}
