import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface Series {
	key: string;
	label: string;
	/** Categorical slot 1–5 (fixed per series, never by rank). */
	slot: number;
	values: number[];
}

/** Width of an element, tracked with ResizeObserver (600 until measured or where unsupported). */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(600);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [ref, width];
}

export function Legend({ series, mark }: { series: Series[]; mark: 'line' | 'rect' }) {
	if (series.length < 2) return null;
	return (
		<ul className="abc-legend">
			{series.map((s) => (
				<li key={s.key}>
					<span className={`abc-legend-key abc-legend-${mark} abc-slot-${s.slot}`} aria-hidden="true" />
					{s.label}
				</li>
			))}
		</ul>
	);
}

/**
 * A chart with its title, legend and a table-view toggle: the table is the
 * accessible twin of the chart and shows every value without hovering.
 */
export function ChartCard({
	title,
	subtitle,
	legend,
	table,
	children,
}: {
	title: string;
	subtitle?: string;
	legend?: ReactNode;
	table: ReactNode;
	children: ReactNode;
}) {
	const [showTable, setShowTable] = useState(false);
	return (
		<figure className="abc-chart-card" aria-label={title}>
			<figcaption className="abc-chart-header">
				<div>
					<div className="abc-chart-title">{title}</div>
					{subtitle && <div className="abc-chart-subtitle">{subtitle}</div>}
				</div>
				<button className="abc-chart-toggle" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
					{showTable ? 'Chart' : 'Table'}
				</button>
			</figcaption>
			{!showTable && legend}
			{showTable ? <div className="abc-chart-table">{table}</div> : children}
		</figure>
	);
}

/** Buckets × series as a plain table. */
export function SeriesTable({
	rowLabels,
	series,
	format,
}: {
	rowLabels: string[];
	series: Series[];
	format: (n: number) => string;
}) {
	return (
		<table>
			<thead>
				<tr>
					<th>Period</th>
					{series.map((s) => (
						<th key={s.key} className="abc-num">
							{s.label}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rowLabels.map((label, i) => (
					<tr key={label + i}>
						<td>{label}</td>
						{series.map((s) => (
							<td key={s.key} className="abc-num">
								{format(s.values[i] ?? 0)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

/** Tooltip listing every series at one x: value first, label second, keyed by a short line. */
export function Tooltip({
	title,
	rows,
	x,
	width,
}: {
	title: string;
	rows: { key: string; slot: number; label: string; value: string }[];
	x: number;
	width: number;
}) {
	// Keep the tooltip inside the chart: flip to the left of the crosshair past the midpoint.
	const style = x > width / 2 ? { right: width - x + 12 } : { left: x + 12 };
	return (
		<div className="abc-tooltip" style={style} role="status">
			<div className="abc-tooltip-title">{title}</div>
			{rows.map((r) => (
				<div key={r.key} className="abc-tooltip-row">
					<span className={`abc-tooltip-key abc-slot-${r.slot}`} aria-hidden="true" />
					<strong>{r.value}</strong>
					<span className="abc-muted">{r.label}</span>
				</div>
			))}
		</div>
	);
}
