import type { CrmSettings } from '../settings';
import type { CrmSnapshot } from './CrmSnapshot';
import { fieldsFor, type FieldSpec } from './fields';
import type { Entity, EntityType } from './types';

/**
 * Rows for a CSV export of one entity type: a header of frontmatter keys,
 * then one row per entity. Links become note names; lists are joined with `; `.
 */
export function exportTable(type: EntityType, crm: CrmSnapshot, settings: CrmSettings): string[][] {
	const specs = fieldsFor(type, settings);
	const billing = type === 'quote' || type === 'invoice';
	const header = [
		...(type === 'interaction' ? ['name'] : []),
		...specs.map((s) => s.key),
		...(billing ? ['net', 'tax', 'gross'] : []),
		'path',
	];
	const rows = crm.all(type).map((entity) => [
		...(type === 'interaction' ? [entity.name] : []),
		...specs.map((spec) => cell(spec, entity, crm)),
		...(entity.type === 'quote' || entity.type === 'invoice'
			? [entity.totals.net, entity.totals.tax, entity.totals.gross].map(String)
			: []),
		entity.path,
	]);
	return [header, ...rows];
}

function cell(spec: FieldSpec, entity: Entity, crm: CrmSnapshot): string {
	if (spec.kind === 'link' || spec.kind === 'links') {
		const resolved = crm.linkedPaths(entity.path, spec.key).map((p) => crm.get(p)?.name ?? p);
		return [...resolved, ...crm.unresolvedLinks(entity.path, spec.key)].join('; ');
	}
	if (spec.kind === 'assets') {
		return [...crm.linkedPaths(entity.path, spec.key), ...crm.unresolvedLinks(entity.path, spec.key)].join('; ');
	}
	if (spec.kind === 'phases' && entity.type === 'project') {
		// e.g. "Discovery (2026-10-01, done); Build (2026-11-15)"
		return entity.phases
			.map((p) => `${p.name}${p.deadline || p.done ? ` (${[p.deadline, p.done ? 'done' : ''].filter(Boolean).join(', ')})` : ''}`)
			.join('; ');
	}
	if (spec.kind === 'items' && (entity.type === 'quote' || entity.type === 'invoice')) {
		// e.g. "2 × Training (days) @ 2000 +19%; 1 × Pilot setup @ 8000 +19%"
		return entity.items.map((i) => `${i.qty} × ${i.description} @ ${i.price}${i.tax ? ` +${i.tax}%` : ''}`).join('; ');
	}
	const raw = spec.custom ? entity.frontmatter[spec.key] : (entity as unknown as Record<string, unknown>)[spec.prop];
	if (Array.isArray(raw)) return raw.map(String).join('; ');
	if (raw instanceof Date) return raw.toISOString().slice(0, 10);
	if (raw === undefined || raw === null) return '';
	if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
	return JSON.stringify(raw);
}
