/** A y-scale from 0 with 3–5 round ticks, e.g. max 7 → 0, 2, 4, 6, 8. */
export function niceScale(max: number, integer = false): { max: number; ticks: number[] } {
	if (!(max > 0)) return { max: integer ? 4 : 1, ticks: integer ? [0, 1, 2, 3, 4] : [0, 0.25, 0.5, 0.75, 1] };
	const raw = max / 4;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	// Counts never get fractional ticks (no 2.5 or 7.5), so skip the 2.5 multiple for them.
	const multiples = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
	const step = Math.max(integer ? 1 : 0, multiples.map((m) => m * magnitude).find((s) => s >= raw)!);
	const top = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
	return { max: top, ticks };
}

const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** `1,284` → `1.3K`, for axis ticks. */
export function compact(n: number): string {
	return compactFormat.format(n);
}

/** Only every nth x-label, so labels at least `minGap` px apart never collide. */
export function labelStep(count: number, plotWidth: number, minGap = 48): number {
	return Math.max(1, Math.ceil((count * minGap) / Math.max(plotWidth, 1)));
}

/** A column with a 4px rounded data-end (top) and a square base. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
	const rr = Math.min(r, w / 2, h);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** A horizontal bar with a 4px rounded data-end (right) and a square base. */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
	const rr = Math.min(r, h / 2, w);
	return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}
