import type { Kpi } from '../../core/stats';
import { Icon } from './Icon';

/** Label, value and change against the previous range (arrow + sign + color, never color alone). */
export function StatTile({
	label,
	kpi,
	format,
	vs,
	upIsGood = true,
	warn = false,
}: {
	label: string;
	kpi: Kpi;
	format: (n: number) => string;
	vs?: string;
	upIsGood?: boolean;
	warn?: boolean;
}) {
	const { value, previous } = kpi;
	let delta: { text: string; tone: 'good' | 'bad' | 'flat'; icon: string } | null = null;
	if (vs && value !== null && previous !== null) {
		if (previous === 0) {
			delta = value === 0 ? { text: 'No change', tone: 'flat', icon: 'minus' } : { text: 'New', tone: upIsGood ? 'good' : 'bad', icon: 'arrow-up' };
		} else {
			const change = (value - previous) / Math.abs(previous);
			const up = change > 0;
			delta =
				Math.abs(change) < 0.005
					? { text: 'No change', tone: 'flat', icon: 'minus' }
					: {
							text: `${up ? '+' : '−'}${Math.round(Math.abs(change) * 100)}%`,
							tone: up === upIsGood ? 'good' : 'bad',
							icon: up ? 'arrow-up' : 'arrow-down',
						};
		}
	}
	return (
		<div className={`abc-stat${warn ? ' is-warning' : ''}`}>
			<div className="abc-stat-label">
				{warn && <Icon name="alert-triangle" />} {label}
			</div>
			<div className="abc-stat-value">{value === null ? '—' : format(value)}</div>
			{delta && (
				<div className={`abc-stat-delta is-${delta.tone}`} title={vs}>
					<Icon name={delta.icon} /> {delta.text} <span className="abc-muted">{vs}</span>
				</div>
			)}
		</div>
	);
}
