import type { CrmSettings } from '../settings';
import type { CrmSnapshot } from './CrmSnapshot';
import { isOverdue, wasSent } from './billing';
import { addDays, daysBetween } from './dates';
import { isClosedStage, openProjects } from './insights';
import { INTERACTION_KINDS, type DateString, type Project, type InteractionKind, type StageChange } from './types';

export type Granularity = 'day' | 'week' | 'month' | 'quarter';

/** How many buckets each granularity shows. */
export const BUCKET_COUNTS: Record<Granularity, number> = { day: 30, week: 12, month: 12, quarter: 8 };

export interface Bucket {
	/** First day in the bucket. */
	start: DateString;
	/** First day after the bucket. */
	end: DateString;
	/** Short axis label, e.g. `Sep 22`, `Sep`, `Q3 2026`. */
	label: string;
	/** Full label for tooltips and tables, e.g. `Week of Sep 22, 2026`. */
	title: string;
}

const utc = (date: DateString) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (date: DateString, options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(utc(date));

function addMonths(date: DateString, months: number): DateString {
	const d = utc(date);
	d.setUTCMonth(d.getUTCMonth() + months, 1);
	return iso(d);
}

/** Start of the bucket containing `date`. Weeks start on Monday. */
export function bucketStart(g: Granularity, date: DateString): DateString {
	switch (g) {
		case 'day':
			return date;
		case 'week':
			return addDays(date, -((utc(date).getUTCDay() + 6) % 7));
		case 'month':
			return `${date.slice(0, 7)}-01`;
		case 'quarter': {
			const month = Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1;
			return `${date.slice(0, 4)}-${String(month).padStart(2, '0')}-01`;
		}
	}
}

function nextStart(g: Granularity, start: DateString): DateString {
	if (g === 'day') return addDays(start, 1);
	if (g === 'week') return addDays(start, 7);
	return addMonths(start, g === 'month' ? 1 : 3);
}

function labels(g: Granularity, start: DateString): Pick<Bucket, 'label' | 'title'> {
	switch (g) {
		case 'day':
			return {
				label: fmt(start, { month: 'short', day: 'numeric' }),
				title: fmt(start, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
			};
		case 'week':
			return {
				label: fmt(start, { month: 'short', day: 'numeric' }),
				title: `Week of ${fmt(start, { month: 'short', day: 'numeric', year: 'numeric' })}`,
			};
		case 'month':
			return { label: fmt(start, { month: 'short' }), title: fmt(start, { month: 'long', year: 'numeric' }) };
		case 'quarter': {
			const q = `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`;
			return { label: q, title: q };
		}
	}
}

/** The `count` buckets ending with the one that contains `today`, oldest first. */
export function makeBuckets(g: Granularity, today: DateString, count = BUCKET_COUNTS[g]): Bucket[] {
	const starts: DateString[] = [bucketStart(g, today)];
	while (starts.length < count) {
		const first = starts[0]!;
		// Step back one bucket: the start of the bucket containing the day before `first`.
		starts.unshift(bucketStart(g, addDays(first, -1)));
	}
	return starts.map((start) => ({ start, end: nextStart(g, start), ...labels(g, start) }));
}

/** Index of the bucket containing `date`, or -1. */
export function bucketIndex(buckets: readonly Bucket[], date: DateString): number {
	return buckets.findIndex((b) => b.start <= date && date < b.end);
}

export interface Kpi {
	value: number | null;
	/** Same measure over the equally long range just before. */
	previous: number | null;
}

export interface Report {
	granularity: Granularity;
	buckets: Bucket[];
	currency: string;
	counts: {
		leads: number[];
		quotesSent: number[];
		invoicesSent: number[];
		won: number[];
		lost: number[];
		newContacts: number[];
	};
	money: {
		/** Gross of invoices sent, by issue date. */
		invoiced: number[];
		/** Gross of invoices paid, by payment date. */
		paid: number[];
	};
	interactions: Record<InteractionKind, number[]>;
	kpis: {
		leads: Kpi;
		quotesSent: Kpi;
		invoicesSent: Kpi;
		invoiced: Kpi;
		revenuePaid: Kpi;
		projectsWon: Kpi;
		wonValue: Kpi;
		/** Accepted ÷ (accepted + declined) of quotes issued in the range; null when none were decided. */
		acceptanceRate: Kpi;
		/** Mean days from issue to payment of invoices paid in the range. */
		avgDaysToPay: Kpi;
		newContacts: Kpi;
		interactions: Kpi;
	};
	/** Right now, not tied to the range. */
	current: { outstanding: number; overdue: number; overdueCount: number; openPipeline: number };
	/** Open stages in pipeline order with project counts and values. */
	pipelineByStage: { stage: string; count: number; value: number }[];
	/** Documents and projects in other currencies, left out of money figures. */
	excludedForCurrency: number;
}

export const isWonStage = (stage: string) => /^(closed[\s-]*)?won$/i.test(stage.trim());
export const isLostStage = (stage: string) => /^(closed[\s-]*)?lost$/i.test(stage.trim());

/** Stage history, or — for projects from before tracking — their current stage since `created`. */
export function stageEntries(project: Project): StageChange[] {
	if (project.stageHistory.length > 0) return project.stageHistory;
	return project.created ? [{ date: project.created, stage: project.stage }] : [];
}

/**
 * Tallies dated values into the current range (per bucket) and the
 * previous range (one total). `all` holds both ranges back to back.
 */
class Tally {
	readonly series: number[];
	previous = 0;
	constructor(
		private all: Bucket[],
		private count: number,
	) {
		this.series = new Array<number>(count).fill(0);
	}
	add(date: DateString | undefined, value = 1) {
		if (!date) return;
		const i = bucketIndex(this.all, date);
		if (i >= this.count) this.series[i - this.count]! += value;
		else if (i >= 0) this.previous += value;
	}
	get total() {
		return this.series.reduce((a, b) => a + b, 0);
	}
	kpi(): Kpi {
		return { value: this.total, previous: this.previous };
	}
}

/** Collects values per range for ratios and averages. */
class RangeSplit<T> {
	current: T[] = [];
	previous: T[] = [];
	constructor(
		private all: Bucket[],
		private count: number,
	) {}
	add(date: DateString | undefined, value: T) {
		if (!date) return;
		const i = bucketIndex(this.all, date);
		if (i >= this.count) this.current.push(value);
		else if (i >= 0) this.previous.push(value);
	}
	kpi(fn: (values: T[]) => number | null): Kpi {
		return { value: fn(this.current), previous: fn(this.previous) };
	}
}

export function buildReport(crm: CrmSnapshot, settings: CrmSettings, g: Granularity, today: DateString): Report {
	const count = BUCKET_COUNTS[g];
	const all = makeBuckets(g, today, count * 2);
	const buckets = all.slice(count);
	const currency = settings.defaultCurrency;
	const leadStage = settings.pipelineStages[0];
	const tally = () => new Tally(all, count);
	let excluded = 0;
	const inCurrency = (c: string | undefined) => {
		const ok = (c ?? currency) === currency;
		if (!ok) excluded++;
		return ok;
	};

	const leads = tally();
	const won = tally();
	const lost = tally();
	const wonValue = tally();
	for (const project of crm.all('project')) {
		const counted = inCurrency(project.currency);
		for (const change of stageEntries(project)) {
			if (change.stage === leadStage) leads.add(change.date);
			if (isWonStage(change.stage)) {
				won.add(change.date);
				if (counted && project.value !== undefined) wonValue.add(change.date, project.value);
			}
			if (isLostStage(change.stage)) lost.add(change.date);
		}
	}

	const quotesSent = tally();
	const decided = new RangeSplit<boolean>(all, count);
	for (const quote of crm.all('quote')) {
		if (!wasSent(quote)) continue;
		quotesSent.add(quote.issued);
		if (quote.status === 'accepted' || quote.status === 'declined') decided.add(quote.issued, quote.status === 'accepted');
	}

	const invoicesSent = tally();
	const invoiced = tally();
	const paid = tally();
	const daysToPay = new RangeSplit<number>(all, count);
	let outstanding = 0;
	let overdue = 0;
	let overdueCount = 0;
	for (const invoice of crm.all('invoice')) {
		if (!wasSent(invoice)) continue;
		const counted = inCurrency(invoice.currency);
		invoicesSent.add(invoice.issued);
		if (counted) invoiced.add(invoice.issued, invoice.totals.gross);
		if (invoice.status === 'paid') {
			if (counted) paid.add(invoice.paidOn, invoice.totals.gross);
			if (invoice.issued && invoice.paidOn) daysToPay.add(invoice.paidOn, daysBetween(invoice.issued, invoice.paidOn));
		}
		if (invoice.status === 'sent' && counted) {
			outstanding += invoice.totals.gross;
			if (isOverdue(invoice, today)) {
				overdue += invoice.totals.gross;
				overdueCount++;
			}
		}
	}

	const newContacts = tally();
	for (const contact of crm.all('contact')) newContacts.add(contact.created);

	const interactionTallies = Object.fromEntries(INTERACTION_KINDS.map((k) => [k, tally()])) as Record<
		InteractionKind,
		Tally
	>;
	const allInteractions = tally();
	for (const i of crm.all('interaction')) {
		interactionTallies[i.kind].add(i.date);
		allInteractions.add(i.date);
	}

	const open = openProjects(crm).filter((d) => (d.currency ?? currency) === currency);
	const pipelineByStage = settings.pipelineStages
		.filter((stage) => !isClosedStage(stage))
		.map((stage) => {
			const projects = open.filter((d) => d.stage === stage);
			return { stage, count: projects.length, value: projects.reduce((sum, d) => sum + (d.value ?? 0), 0) };
		});

	const round = (n: number) => Math.round(n * 100) / 100;
	return {
		granularity: g,
		buckets,
		currency,
		counts: {
			leads: leads.series,
			quotesSent: quotesSent.series,
			invoicesSent: invoicesSent.series,
			won: won.series,
			lost: lost.series,
			newContacts: newContacts.series,
		},
		money: { invoiced: invoiced.series.map(round), paid: paid.series.map(round) },
		interactions: Object.fromEntries(INTERACTION_KINDS.map((k) => [k, interactionTallies[k].series])) as Record<
			InteractionKind,
			number[]
		>,
		kpis: {
			leads: leads.kpi(),
			quotesSent: quotesSent.kpi(),
			invoicesSent: invoicesSent.kpi(),
			invoiced: invoiced.kpi(),
			revenuePaid: paid.kpi(),
			projectsWon: won.kpi(),
			wonValue: wonValue.kpi(),
			acceptanceRate: decided.kpi((v) => (v.length === 0 ? null : v.filter(Boolean).length / v.length)),
			avgDaysToPay: daysToPay.kpi((v) => (v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length)),
			newContacts: newContacts.kpi(),
			interactions: allInteractions.kpi(),
		},
		current: {
			outstanding: round(outstanding),
			overdue: round(overdue),
			overdueCount,
			openPipeline: open.reduce((sum, d) => sum + (d.value ?? 0), 0),
		},
		pipelineByStage,
		excludedForCurrency: excluded,
	};
}

/** Invoice statuses as charted: `sent` splits into pending and overdue. */
export const INVOICE_CHART_STATUSES = ['pending', 'overdue', 'paid', 'draft', 'void'] as const;
export type InvoiceChartStatus = (typeof INVOICE_CHART_STATUSES)[number];

/**
 * Gross amount of every invoice per period, split by its status today.
 * Invoices are placed by issue date (drafts without one by `created`), so
 * each appears exactly once. Only the default currency is summed.
 */
export function invoicesByStatus(
	crm: CrmSnapshot,
	settings: CrmSettings,
	g: Granularity,
	today: DateString,
): { buckets: Bucket[]; amounts: Record<InvoiceChartStatus, number[]>; excluded: number } {
	const buckets = makeBuckets(g, today);
	const amounts = Object.fromEntries(INVOICE_CHART_STATUSES.map((s) => [s, buckets.map(() => 0)])) as Record<
		InvoiceChartStatus,
		number[]
	>;
	let excluded = 0;
	for (const invoice of crm.all('invoice')) {
		if ((invoice.currency ?? settings.defaultCurrency) !== settings.defaultCurrency) {
			excluded++;
			continue;
		}
		const date = invoice.issued ?? invoice.created;
		const i = date ? bucketIndex(buckets, date) : -1;
		if (i < 0) continue;
		const status: InvoiceChartStatus =
			invoice.status === 'sent' ? (isOverdue(invoice, today) ? 'overdue' : 'pending') : invoice.status;
		amounts[status][i] = Math.round((amounts[status][i]! + invoice.totals.gross) * 100) / 100;
	}
	return { buckets, amounts, excluded };
}
