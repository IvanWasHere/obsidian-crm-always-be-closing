import type { CrmSnapshot } from '../core/CrmSnapshot';
import type { FieldSpec, FieldValue } from '../core/fields';
import type { Entity } from '../core/types';

/** The value of a field as the UI edits it (see FieldValue). */
export function readFieldValue(spec: FieldSpec, entity: Entity, crm: CrmSnapshot): FieldValue {
	if (spec.kind === 'link' || spec.kind === 'links') return crm.linkedPaths(entity.path, spec.key);
	const raw = (entity as unknown as Record<string, unknown>)[spec.prop];
	if (spec.kind === 'tags') return Array.isArray(raw) ? raw.join(', ') : '';
	return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
}

export function sameValue(a: FieldValue, b: FieldValue): boolean {
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
	return a === b;
}
