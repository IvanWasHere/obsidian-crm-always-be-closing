import type { FieldSpec } from '../../core/fields';
import type { Entity } from '../../core/types';
import { readFieldValue } from '../fieldValues';
import { CrmSnapshot } from '../../core/CrmSnapshot';
import type { Column } from './DataTable';

/** Table columns for custom fields marked "show in table". */
export function customColumns<T>(specs: FieldSpec[], entityOf: (row: T) => Entity): Column<T>[] {
	// Custom fields are never links, so no snapshot is needed to read them.
	const read = (spec: FieldSpec, row: T) => readFieldValue(spec, entityOf(row), CrmSnapshot.empty) as string;

	return specs
		.filter((s) => s.custom && s.showInTable)
		.map((spec) => ({
			id: `custom:${spec.key}`,
			header: spec.label,
			sortValue: (row) => {
				const value = read(spec, row);
				if (value === '') return undefined;
				return spec.kind === 'number' ? Number(value) : value.toLowerCase();
			},
			render: (row) => {
				const value = read(spec, row);
				if (spec.kind === 'checkbox') return value ? '✓' : '';
				if (spec.kind === 'url' && /^https?:\/\//.test(value)) {
					return (
						<a className="external-link" href={value} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
							{value.replace(/^https?:\/\/(www\.)?/, '')}
						</a>
					);
				}
				return value;
			},
		}));
}
