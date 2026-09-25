import { useMemo, useState } from 'react';
import { buildReport, BUCKET_COUNTS, type Granularity, type Report } from '../../core/stats';
import { formatDate } from '../../core/schema';
import { INTERACTION_KINDS } from '../../core/types';
import { formatMoney } from '../format';
import { useCrm } from '../hooks/useCrm';
import { useSettings } from '../hooks/useSettings';
import { StatTile } from '../components/StatTile';
import { BarList } from '../charts/BarList';
import { ChartCard, Legend, SeriesTable, type Series } from '../charts/ChartCard';
import { TimeChart } from '../charts/TimeChart';

const GRANULARITIES: { value: Granularity; label: string; unit: string }[] = [
	{ value: 'day', label: 'Daily', unit: 'days' },
	{ value: 'week', label: 'Weekly', unit: 'weeks' },
	{ value: 'month', label: 'Monthly', unit: 'months' },
	{ value: 'quarter', label: 'Quarterly', unit: 'quarters' },
];

const count = (n: number) => n.toLocaleString();
const percent = (n: number) => `${Math.round(n * 100)}%`;
const days = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} days`;

/** Sales activity, revenue and pipeline over time, by day, week, month or quarter. */
export function ReportsView() {
	const crm = useCrm();
	const settings = useSettings();
	const [granularity, setGranularity] = useState<Granularity>('month');
	const today = formatDate(new Date());
	const report = useMemo(() => buildReport(crm, settings, granularity, today), [crm, settings, granularity, today]);

	const g = GRANULARITIES.find((x) => x.value === granularity)!;
	const range = `last ${BUCKET_COUNTS[granularity]} ${g.unit}`;
	const vs = `vs previous ${BUCKET_COUNTS[granularity]} ${g.unit}`;
	const money = (n: number) => formatMoney(n, report.currency);

	return (
		<div className="abc-reports">
			<div className="abc-toolbar">
				<div className="abc-segmented" role="radiogroup" aria-label="Period">
					{GRANULARITIES.map((x) => (
						<button
							key={x.value}
							role="radio"
							aria-checked={granularity === x.value}
							className={granularity === x.value ? 'is-active' : undefined}
							onClick={() => setGranularity(x.value)}
						>
							{x.label}
						</button>
					))}
				</div>
				<span className="abc-count">Showing the {range}</span>
			</div>

			<div className="abc-kpis">
				<StatTile label="Leads" kpi={report.kpis.leads} format={count} vs={vs} />
				<StatTile label="Quotes sent" kpi={report.kpis.quotesSent} format={count} vs={vs} />
				<StatTile label="Invoices sent" kpi={report.kpis.invoicesSent} format={count} vs={vs} />
				<StatTile label="Revenue paid" kpi={report.kpis.revenuePaid} format={money} vs={vs} />
				<StatTile label="Projects won" kpi={report.kpis.projectsWon} format={count} vs={vs} />
				<StatTile label="Quote acceptance" kpi={report.kpis.acceptanceRate} format={percent} vs={vs} />
				<StatTile label="Average time to payment" kpi={report.kpis.avgDaysToPay} format={days} vs={vs} upIsGood={false} />
				<StatTile label="New contacts" kpi={report.kpis.newContacts} format={count} vs={vs} />
			</div>

			<div className="abc-kpis abc-kpis-now">
				<StatTile label="Outstanding now" kpi={{ value: report.current.outstanding, previous: null }} format={money} />
				<StatTile
					label={`Overdue now (${report.current.overdueCount})`}
					kpi={{ value: report.current.overdue, previous: null }}
					format={money}
					warn={report.current.overdue > 0}
				/>
				<StatTile label="Open pipeline" kpi={{ value: report.current.openPipeline, previous: null }} format={money} />
			</div>

			{report.excludedForCurrency > 0 && (
				<p className="abc-muted abc-reports-note">
					Money figures are in {report.currency}. {report.excludedForCurrency} projects, quotes or invoices in other
					currencies are left out of them.
				</p>
			)}

			<div className="abc-charts">
				<ActivityChart report={report} subtitle={`Per ${granularity} · ${range}`} />
				<RevenueChart report={report} subtitle={`Per ${granularity} · ${range} · ${report.currency}`} money={money} />
				<WonLostChart report={report} subtitle={`Per ${granularity} · ${range}`} />
				<InteractionsChart report={report} subtitle={`Per ${granularity} · ${range}`} />
				<PipelineChart report={report} money={money} />
			</div>
		</div>
	);
}

function timeTable(report: Report, series: Series[], format: (n: number) => string) {
	return <SeriesTable rowLabels={report.buckets.map((b) => b.title)} series={series} format={format} />;
}

function ActivityChart({ report, subtitle }: { report: Report; subtitle: string }) {
	const series: Series[] = [
		{ key: 'leads', label: 'Leads', slot: 1, values: report.counts.leads },
		{ key: 'quotes', label: 'Quotes sent', slot: 2, values: report.counts.quotesSent },
		{ key: 'invoices', label: 'Invoices sent', slot: 3, values: report.counts.invoicesSent },
	];
	return (
		<ChartCard
			title="Leads, quotes and invoices"
			subtitle={subtitle}
			legend={<Legend series={series} mark="line" />}
			table={timeTable(report, series, count)}
		>
			<TimeChart buckets={report.buckets} series={series} mode="line" format={count} integer label="Leads, quotes sent and invoices sent per period" />
		</ChartCard>
	);
}

function RevenueChart({ report, subtitle, money }: { report: Report; subtitle: string; money: (n: number) => string }) {
	const series: Series[] = [
		{ key: 'invoiced', label: 'Invoiced', slot: 1, values: report.money.invoiced },
		{ key: 'paid', label: 'Paid', slot: 2, values: report.money.paid },
	];
	return (
		<ChartCard title="Revenue" subtitle={subtitle} legend={<Legend series={series} mark="rect" />} table={timeTable(report, series, money)}>
			<TimeChart buckets={report.buckets} series={series} mode="columns" format={money} label="Amount invoiced and paid per period" />
		</ChartCard>
	);
}

function WonLostChart({ report, subtitle }: { report: Report; subtitle: string }) {
	const series: Series[] = [
		{ key: 'won', label: 'Won', slot: 1, values: report.counts.won },
		{ key: 'lost', label: 'Lost', slot: 2, values: report.counts.lost },
	];
	return (
		<ChartCard title="Projects won and lost" subtitle={subtitle} legend={<Legend series={series} mark="rect" />} table={timeTable(report, series, count)}>
			<TimeChart buckets={report.buckets} series={series} mode="columns" format={count} integer label="Projects won and lost per period" />
		</ChartCard>
	);
}

function InteractionsChart({ report, subtitle }: { report: Report; subtitle: string }) {
	// Slots follow the fixed kind order, so a kind keeps its color whatever the data.
	const series: Series[] = INTERACTION_KINDS.map((kind, i) => ({
		key: kind,
		label: kind[0]!.toUpperCase() + kind.slice(1),
		slot: i + 1,
		values: report.interactions[kind],
	}));
	return (
		<ChartCard title="Interactions by kind" subtitle={subtitle} legend={<Legend series={series} mark="rect" />} table={timeTable(report, series, count)}>
			<TimeChart buckets={report.buckets} series={series} mode="stacked" format={count} integer label="Interactions per period, stacked by kind" />
		</ChartCard>
	);
}

function PipelineChart({ report, money }: { report: Report; money: (n: number) => string }) {
	const rows = report.pipelineByStage.map((s) => ({
		label: s.stage,
		value: s.value,
		valueLabel: `${money(s.value)} · ${s.count} ${s.count === 1 ? 'project' : 'projects'}`,
	}));
	return (
		<ChartCard
			title="Open pipeline by stage"
			subtitle={`Right now · ${report.currency}`}
			table={
				<table>
					<thead>
						<tr>
							<th>Stage</th>
							<th className="abc-num">Projects</th>
							<th className="abc-num">Value</th>
						</tr>
					</thead>
					<tbody>
						{report.pipelineByStage.map((s) => (
							<tr key={s.stage}>
								<td>{s.stage}</td>
								<td className="abc-num">{s.count}</td>
								<td className="abc-num">{money(s.value)}</td>
							</tr>
						))}
					</tbody>
				</table>
			}
		>
			<BarList rows={rows} label="Value of open projects in each pipeline stage" />
		</ChartCard>
	);
}
