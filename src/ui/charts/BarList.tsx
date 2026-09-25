import { useWidth } from './ChartCard';
import { barPath } from './scale';

export interface BarRow {
	label: string;
	value: number;
	/** Text at the bar's end, e.g. `€12,000 · 3 projects`. */
	valueLabel: string;
}

const ROW = 28;
const BAR = 16;
const LABEL_WIDTH = 110;
const VALUE_ROOM = 120;

/**
 * Horizontal bars for one series (slot 1), labelled at the bar end. Every value
 * is printed, so no tooltip is needed: nothing is hidden behind hover.
 */
export function BarList({ rows, label }: { rows: BarRow[]; label: string }) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const max = Math.max(0, ...rows.map((r) => r.value));
	const plot = Math.max(40, width - LABEL_WIDTH - VALUE_ROOM);
	const height = rows.length * ROW;
	return (
		<div className="abc-chart-plot" ref={ref}>
			<svg width={width} height={height} role="img" aria-label={label}>
				<line className="abc-baseline" x1={LABEL_WIDTH} x2={LABEL_WIDTH} y1={0} y2={height} />
				{rows.map((r, i) => {
					const w = max > 0 ? (r.value / max) * plot : 0;
					const top = i * ROW + (ROW - BAR) / 2;
					return (
						<g key={r.label}>
							<text className="abc-axis-label abc-bar-label" x={LABEL_WIDTH - 8} y={top + BAR / 2} dy="0.32em" textAnchor="end">
								{r.label}
							</text>
							{w > 0 && <path className="abc-bar abc-slot-1" d={barPath(LABEL_WIDTH, top, w, BAR)} />}
							<text className="abc-value-label" x={LABEL_WIDTH + w + 6} y={top + BAR / 2} dy="0.32em">
								{r.valueLabel}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
