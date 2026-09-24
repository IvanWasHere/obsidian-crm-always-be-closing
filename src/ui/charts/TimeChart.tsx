import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Bucket } from '../../core/stats';
import { Tooltip, useWidth, type Series } from './ChartCard';
import { columnPath, compact, labelStep, niceScale } from './scale';

interface Props {
	buckets: Bucket[];
	series: Series[];
	/** `line`: one line per series. `columns`: grouped. `stacked`: one stacked column per bucket. */
	mode: 'line' | 'columns' | 'stacked';
	format: (n: number) => string;
	/** Whole-number axis (counts). */
	integer?: boolean;
	/** Accessible summary of what the chart shows. */
	label: string;
}

const PLOT_HEIGHT = 200;
const MARGIN = { top: 8, right: 12, bottom: 24, left: 44 };
const MAX_BAR = 24;
const GAP = 2;

/**
 * Time-series chart over period buckets. Hover (or arrow keys when focused)
 * moves a highlight across buckets and shows every series in one tooltip.
 */
export function TimeChart({ buckets, series, mode, format, integer, label }: Props) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [active, setActive] = useState<number | null>(null);

	const n = buckets.length;
	const plotWidth = width - MARGIN.left - MARGIN.right;
	const band = plotWidth / Math.max(n, 1);
	const totals = buckets.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
	const max = mode === 'stacked' ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values));
	const scale = niceScale(max, integer);
	const y = (v: number) => MARGIN.top + PLOT_HEIGHT - (v / scale.max) * PLOT_HEIGHT;
	const cx = (i: number) => MARGIN.left + band * (i + 0.5);
	const step = labelStep(n, plotWidth);
	const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;

	const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const i = Math.floor((e.clientX - rect.left - MARGIN.left) / band);
		setActive(i >= 0 && i < n ? i : null);
	};
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			e.preventDefault();
			const delta = e.key === 'ArrowRight' ? 1 : -1;
			setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + (i === null ? 0 : delta))));
		} else if (e.key === 'Escape') {
			setActive(null);
		}
	};

	return (
		<div className="abc-chart-plot" ref={ref}>
			<svg
				width={width}
				height={height}
				role="img"
				aria-label={label}
				tabIndex={0}
				onPointerMove={onPointerMove}
				onPointerLeave={() => setActive(null)}
				onFocus={() => setActive((i) => i ?? n - 1)}
				onBlur={() => setActive(null)}
				onKeyDown={onKeyDown}
			>
				{/* Gridlines and y ticks */}
				{scale.ticks.map((t) => (
					<g key={t}>
						<line className="abc-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
						<text className="abc-axis-label" x={MARGIN.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
							{compact(t)}
						</text>
					</g>
				))}
				{/* Hover wash on the active bucket */}
				{active !== null && mode !== 'line' && (
					<rect className="abc-hover-band" x={MARGIN.left + band * active} y={MARGIN.top} width={band} height={PLOT_HEIGHT} />
				)}

				{mode === 'line' && <Lines series={series} n={n} cx={cx} y={y} />}
				{mode === 'columns' && <Columns series={series} band={band} y={y} />}
				{mode === 'stacked' && <Stacks series={series} n={n} band={band} y={y} />}

				{/* Crosshair and markers for lines */}
				{active !== null && mode === 'line' && (
					<g>
						<line className="abc-crosshair" x1={cx(active)} x2={cx(active)} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT} />
						{series.map((s) => (
							<circle key={s.key} className={`abc-marker abc-slot-${s.slot}`} cx={cx(active)} cy={y(s.values[active] ?? 0)} r={4} />
						))}
					</g>
				)}

				{/* Baseline and x labels */}
				<line
					className="abc-baseline"
					x1={MARGIN.left}
					x2={width - MARGIN.right}
					y1={MARGIN.top + PLOT_HEIGHT}
					y2={MARGIN.top + PLOT_HEIGHT}
				/>
				{buckets.map((b, i) =>
					// Always label the latest bucket; thin out the rest so labels don't collide.
					(n - 1 - i) % step === 0 ? (
						<text key={b.start} className="abc-axis-label" x={cx(i)} y={MARGIN.top + PLOT_HEIGHT + 16} textAnchor="middle">
							{b.label}
						</text>
					) : null,
				)}
			</svg>
			{active !== null && (
				<Tooltip
					title={buckets[active]!.title}
					x={cx(active)}
					width={width}
					rows={[
						...series.map((s) => ({ key: s.key, slot: s.slot, label: s.label, value: format(s.values[active] ?? 0) })),
						...(mode === 'stacked' && series.length > 1
							? [{ key: '__total', slot: 0, label: 'Total', value: format(totals[active] ?? 0) }]
							: []),
					]}
				/>
			)}
		</div>
	);
}

function Lines({ series, n, cx, y }: { series: Series[]; n: number; cx: (i: number) => number; y: (v: number) => number }) {
	return (
		<g>
			{series.map((s) => {
				const points = Array.from({ length: n }, (_, i) => `${cx(i)},${y(s.values[i] ?? 0)}`).join(' ');
				const last = n - 1;
				return (
					<g key={s.key}>
						<polyline className={`abc-line abc-slot-${s.slot}`} points={points} />
						{/* End dot marks the latest value */}
						<circle className={`abc-marker abc-slot-${s.slot}`} cx={cx(last)} cy={y(s.values[last] ?? 0)} r={4} />
					</g>
				);
			})}
		</g>
	);
}

function Columns({ series, band, y }: { series: Series[]; band: number; y: (v: number) => number }) {
	const k = series.length;
	// Bars share ~70% of the band, capped at 24px each, with a 2px gap between neighbours.
	const barWidth = Math.max(2, Math.min(MAX_BAR, (band * 0.7 - GAP * (k - 1)) / k));
	const groupWidth = barWidth * k + GAP * (k - 1);
	const base = y(0);
	return (
		<g>
			{series[0]?.values.map((_, i) =>
				series.map((s, j) => {
					const v = s.values[i] ?? 0;
					if (v <= 0) return null;
					const x = MARGIN.left + band * i + (band - groupWidth) / 2 + j * (barWidth + GAP);
					return <path key={`${s.key}-${i}`} className={`abc-bar abc-slot-${s.slot}`} d={columnPath(x, y(v), barWidth, base - y(v))} />;
				}),
			)}
		</g>
	);
}

function Stacks({ series, n, band, y }: { series: Series[]; n: number; band: number; y: (v: number) => number }) {
	const barWidth = Math.max(2, Math.min(MAX_BAR, band * 0.6));
	return (
		<g>
			{Array.from({ length: n }, (_, i) => {
				const x = MARGIN.left + band * i + (band - barWidth) / 2;
				const present = series.filter((s) => (s.values[i] ?? 0) > 0);
				let acc = 0;
				return present.map((s, j) => {
					const v = s.values[i]!;
					const top = y(acc + v);
					const bottom = y(acc);
					acc += v;
					const isTop = j === present.length - 1;
					// A 2px surface gap separates segments; only the top segment gets the rounded end.
					const h = Math.max(0, bottom - top - (j > 0 ? GAP : 0));
					const d = isTop ? columnPath(x, top, barWidth, h) : `M${x},${top}h${barWidth}v${h}h${-barWidth}Z`;
					return <path key={`${s.key}-${i}`} className={`abc-bar abc-slot-${s.slot}`} d={d} />;
				});
			})}
		</g>
	);
}
