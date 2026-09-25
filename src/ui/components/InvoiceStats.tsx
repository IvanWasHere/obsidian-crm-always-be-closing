import { useMemo, useState } from 'react';
import {
	BUCKET_COUNTS,
	buildReport,
	INVOICE_CHART_STATUSES,
	invoicesByStatus,
	type Granularity,
	type InvoiceChartStatus,
} from '../../core/stats';
import { formatDate } from '../../core/schema';
import { formatMoney } from '../format';
import { useCrm } from '../hooks/useCrm';
import { useSettings } from '../hooks/useSettings';
import { ChartCard, Legend, SeriesTable, type Series } from '../charts/ChartCard';
import { TimeChart } from '../charts/TimeChart';
import { StatTile } from './StatTile';

const PERIODS: { value: Granularity; label: string; unit: string }[] = [
	{ value: 'day', label: 'Daily', unit: 'days' },
	{ value: 'week', label: 'Weekly', unit: 'weeks' },
	{ value: 'month', label: 'Monthly', unit: 'months' },
	{ value: 'quarter', label: 'Quarterly', unit: 'quarters' },
];

/**
 * Categorical slot per status. Series are stacked in slot order so only
 * palette-validated neighbours touch; overdue gets orange and paid the
 * greenish aqua. The label (legend, tooltip, table) always names the status.
 */
const STATUS_SERIES: Record<InvoiceChartStatus, { label: string; slot: number }> = {
	pending: { label: 'Pending', slot: 1 },
	overdue: { label: 'Overdue', slot: 2 },
	paid: { label: 'Paid', slot: 3 },
	draft: { label: 'Draft', slot: 4 },
	void: { label: 'Void', slot: 5 },
};

/**
 * Invoice amounts over time for the dashboard: every invoice in the period
 * of its issue date, stacked by status, plus headline tiles.
 */
export function InvoiceStats() {
	const crm = useCrm();
	const settings = useSettings();
	const [granularity, setGranularity] = useState<Granularity>('month');
	const today = formatDate(new Date());
	const report = useMemo(() => buildReport(crm, settings, granularity, today), [crm, settings, granularity, today]);
	const byStatus = useMemo(() => invoicesByStatus(crm, settings, granularity, today), [crm, settings, granularity, today]);

	const period = PERIODS.find((p) => p.value === granularity)!;
	const range = `last ${BUCKET_COUNTS[granularity]} ${period.unit}`;
	const vs = `vs previous ${BUCKET_COUNTS[granularity]} ${period.unit}`;
	const money = (n: number) => formatMoney(n, report.currency);

	const series: Series[] = INVOICE_CHART_STATUSES.map((status) => ({
		key: status,
		...STATUS_SERIES[status],
		values: byStatus.amounts[status],
	}));

	return (
		<section className="abc-dashboard-panel abc-invoice-stats" aria-label="Invoices">
			<div className="abc-toolbar">
				<h3>Invoices</h3>
				<div className="abc-segmented" role="radiogroup" aria-label="Invoice period">
					{PERIODS.map((p) => (
						<button
							key={p.value}
							role="radio"
							aria-checked={granularity === p.value}
							className={granularity === p.value ? 'is-active' : undefined}
							onClick={() => setGranularity(p.value)}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			<div className="abc-kpis">
				<StatTile label="Issued" kpi={report.kpis.invoiced} format={money} vs={vs} />
				<StatTile label="Paid" kpi={report.kpis.revenuePaid} format={money} vs={vs} />
				<StatTile label="Pending now" kpi={{ value: report.current.outstanding, previous: null }} format={money} />
				<StatTile
					label={`Overdue now (${report.current.overdueCount})`}
					kpi={{ value: report.current.overdue, previous: null }}
					format={money}
					warn={report.current.overdue > 0}
				/>
			</div>

			<ChartCard
				title="Invoices by status"
				subtitle={`By issue date · per ${granularity} · ${range} · ${report.currency}. Colors show each invoice's status today.`}
				legend={<Legend series={series} mark="rect" />}
				table={<SeriesTable rowLabels={byStatus.buckets.map((b) => b.title)} series={series} format={money} />}
			>
				<TimeChart
					buckets={byStatus.buckets}
					series={series}
					mode="stacked"
					format={money}
					label="Invoice amounts per period by issue date, stacked by status"
				/>
			</ChartCard>
			{byStatus.excluded > 0 && (
				<p className="abc-muted abc-reports-note">
					Amounts are in {report.currency}; documents in other currencies are left out.
				</p>
			)}
		</section>
	);
}
