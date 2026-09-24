import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface Column<T> {
	id: string;
	header: string;
	render: (row: T) => ReactNode;
	/** Value to sort by; omit to make the column unsortable. Empty values sort last. */
	sortValue?: (row: T) => string | number | undefined;
}

export interface SortState {
	id: string;
	desc: boolean;
}

interface Props<T> {
	rows: readonly T[];
	columns: Column<T>[];
	rowKey: (row: T) => string;
	onRowOpen?: (row: T, event: MouseEvent | KeyboardEvent) => void;
	initialSort?: SortState;
}

const isEmpty = (v: unknown) => v === undefined || v === '';

export function sortRows<T>(rows: readonly T[], column: Column<T> | undefined, desc: boolean): readonly T[] {
	const value = column?.sortValue;
	if (!value) return rows;
	return [...rows].sort((a, b) => {
		const va = value(a);
		const vb = value(b);
		// Empty values stay at the bottom in both directions.
		if (isEmpty(va) || isEmpty(vb)) return Number(isEmpty(va)) - Number(isEmpty(vb));
		const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
		return desc ? -cmp : cmp;
	});
}

/**
 * A sortable table. Rows become cards in narrow panes (see styles.css), using
 * each cell's `data-label`. Filtering is left to the caller.
 */
export function DataTable<T>({ rows, columns, rowKey, onRowOpen, initialSort }: Props<T>) {
	const [sort, setSort] = useState<SortState | undefined>(initialSort);

	const sorted = useMemo(
		() => sortRows(rows, columns.find((c) => c.id === sort?.id), sort?.desc ?? false),
		[rows, columns, sort],
	);

	const toggle = (id: string) =>
		setSort((s) => (s?.id === id ? { id, desc: !s.desc } : { id, desc: false }));

	return (
		<table className="abc-table">
			<thead>
				<tr>
					{columns.map((col) => {
						const dir = sort?.id === col.id ? (sort.desc ? 'descending' : 'ascending') : undefined;
						return (
							<th key={col.id} aria-sort={dir}>
								{col.sortValue ? (
									<button className="abc-sort" onClick={() => toggle(col.id)}>
										{col.header}
										{dir && <Icon name={dir === 'ascending' ? 'chevron-up' : 'chevron-down'} />}
									</button>
								) : (
									col.header
								)}
							</th>
						);
					})}
				</tr>
			</thead>
			<tbody>
				{sorted.map((row) => (
					<tr
						key={rowKey(row)}
						tabIndex={onRowOpen ? 0 : undefined}
						onClick={onRowOpen && ((e) => onRowOpen(row, e))}
						onKeyDown={
							onRowOpen &&
							((e) => {
								if (e.key === 'Enter' && e.target === e.currentTarget) onRowOpen(row, e);
							})
						}
					>
						{columns.map((col) => (
							<td key={col.id} data-label={col.header}>
								{col.render(row)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
