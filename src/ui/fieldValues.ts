import type { CrmSnapshot } from '../core/CrmSnapshot';
import type { FieldSpec, FieldValue } from '../core/fields';
import type { Entity } from '../core/types';

/** The value of a field as the UI edits it (see FieldValue). */
export function readFieldValue(spec: FieldSpec, entity: Entity, crm: CrmSnapshot): FieldValue {
	if (spec.kind === 'link' || spec.kind === 'links' || spec.kind === 'assets') return crm.linkedPaths(entity.path, spec.key);
	if (spec.kind === 'phases') {
		const phases = entity.type === 'project' ? entity.phases : [];
		return phases.map((p) => ({ name: p.name, deadline: p.deadline ?? '', done: p.done ? 'true' : '' }));
	}
	if (spec.kind === 'items') {
		const items = entity.type === 'quote' || entity.type === 'invoice' ? entity.items : [];
		return items.map((i) => ({ description: i.description, qty: String(i.qty), price: String(i.price), tax: String(i.tax) }));
	}
	const raw = spec.custom ? entity.frontmatter[spec.key] : (entity as unknown as Record<string, unknown>)[spec.prop];
	if (spec.kind === 'tags') return Array.isArray(raw) ? raw.filter((t) => typeof t === 'string').join(', ') : '';
	if (spec.kind === 'checkbox') return raw === true || raw === 'true' ? 'true' : '';
	if (spec.kind === 'date' && raw instanceof Date) return raw.toISOString().slice(0, 10);
	return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
}

export function sameValue(a: FieldValue, b: FieldValue): boolean {
	if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
	return a === b;
}
