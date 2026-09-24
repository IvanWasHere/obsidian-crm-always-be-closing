import type { Company, Contact, Deal, Entity, EntityOfType, EntityType, Interaction, Wikilink } from './types';

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
		deal: [],
		interaction: [],
	};
	/** entity path → paths of the entities it links to. */
	private readonly forward = new Map<string, { company?: string; deal?: string; contacts: string[] }>();
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

		// Only keep links that point at indexed entities of the expected type.
		const target = (link: Wikilink | undefined, from: string, type: EntityType) => {
			if (!link) return undefined;
			const path = resolve(link, from);
			return path && entities.get(path)?.type === type ? path : undefined;
		};

		// Visit in sorted order so every reverse list comes out sorted too.
		const linkers: (Contact | Deal | Interaction)[] = [
			...this.byType.contact,
			...this.byType.deal,
			...this.byType.interaction,
		];
		for (const entity of linkers) {
			const company = entity.type === 'interaction' ? undefined : target(entity.company, entity.path, 'company');
			const deal = entity.type === 'interaction' ? target(entity.deal, entity.path, 'deal') : undefined;
			const contacts =
				entity.type === 'contact'
					? []
					: [
							...new Set(
								entity.contacts
									.map((l) => target(l, entity.path, 'contact'))
									.filter((p): p is string => p !== undefined),
							),
						];
			this.forward.set(entity.path, { company, deal, contacts });
			if (company) push(this.reverse, company, entity);
			if (deal) push(this.reverse, deal, entity);
			for (const c of contacts) push(this.reverse, c, entity);
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

	/** The company a contact or deal links to. */
	companyOf(path: string): Company | undefined {
		const target = this.forward.get(path)?.company;
		return target ? this.get(target, 'company') : undefined;
	}

	/** The deal an interaction links to. */
	dealOf(path: string): Deal | undefined {
		const target = this.forward.get(path)?.deal;
		return target ? this.get(target, 'deal') : undefined;
	}

	/** Contacts on a deal or interaction, or the contacts of a company. */
	contactsOf(path: string): readonly Contact[] {
		if (this.entities.get(path)?.type === 'company') return this.linking(path, 'contact');
		const own = this.forward.get(path)?.contacts ?? [];
		return own.map((p) => this.get(p, 'contact')!);
	}

	/** Deals of a company, or deals a contact is on. */
	dealsOf(path: string): readonly Deal[] {
		return this.linking(path, 'deal');
	}

	/**
	 * Interactions involving a contact or deal, newest first. For a company,
	 * this rolls up interactions of its contacts and deals.
	 */
	interactionsOf(path: string): readonly Interaction[] {
		const entity = this.entities.get(path);
		if (entity?.type !== 'company') return this.linking(path, 'interaction');
		const seen = new Set<Interaction>();
		for (const related of [...this.linking(path, 'contact'), ...this.linking(path, 'deal')]) {
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
