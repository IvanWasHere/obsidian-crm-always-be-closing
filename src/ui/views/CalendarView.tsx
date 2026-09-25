import { useMemo, useState, type MouseEvent } from 'react';
import { Platform } from 'obsidian';
import {
	calendarEvents,
	EVENT_CATEGORIES,
	layoutDay,
	minutes,
	monthGrid,
	weekStart,
	type CalendarEvent,
	type EventCategory,
} from '../../core/calendar';
import { addDays } from '../../core/dates';
import { formatDate } from '../../core/schema';
import { openScheduleModal } from '../../obsidian/modals';
import { useCrm } from '../hooks/useCrm';
import { useOpenNote } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { Icon } from '../components/Icon';

type Mode = 'month' | 'week' | 'agenda';

/** Each category keeps its color slot, icon and label whatever is toggled. */
export const CATEGORY_META: Record<EventCategory, { label: string; slot: number; icon: string }> = {
	meeting: { label: 'Meetings', slot: 1, icon: 'calendar-clock' },
	'follow-up': { label: 'Follow-ups', slot: 2, icon: 'bell' },
	'invoice-due': { label: 'Invoices due', slot: 3, icon: 'receipt' },
	'project-close': { label: 'Project closes', slot: 4, icon: 'target' },
	interaction: { label: 'Past interactions', slot: 5, icon: 'history' },
	deadline: { label: 'Deadlines', slot: 6, icon: 'flag' },
};

const AGENDA_DAYS = 30;
const HOUR_PX = 44;

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(utc(date));
const fmtTime = (time: string) => {
	const [h, m] = time.split(':').map(Number);
	return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
		new Date(Date.UTC(2000, 0, 1, h, m)),
	);
};

/** Hour-only label for the time grid gutter: "9 AM" or "09" depending on locale. */
const fmtHour = (h: number) =>
	new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h)));

function addMonths(date: string, n: number): string {
	const d = utc(`${date.slice(0, 7)}-01`);
	d.setUTCMonth(d.getUTCMonth() + n);
	return d.toISOString().slice(0, 10);
}

/** Meetings, follow-ups, invoice due dates and project closes in a month, week or agenda layout. */
export function CalendarView() {
	const crm = useCrm();
	const { plugin } = usePlugin();
	const today = formatDate(new Date());
	const [mode, setMode] = useState<Mode>(Platform.isPhone ? 'agenda' : 'month');
	const [cursor, setCursor] = useState(today);
	const [include, setInclude] = useState<ReadonlySet<EventCategory>>(() => new Set(EVENT_CATEGORIES));

	const range = useMemo(() => {
		if (mode === 'month') {
			const grid = monthGrid(cursor);
			return { from: grid[0]!, to: addDays(grid[41]!, 1), grid };
		}
		if (mode === 'week') {
			const from = weekStart(cursor);
			return { from, to: addDays(from, 7), grid: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
		}
		return { from: cursor, to: addDays(cursor, AGENDA_DAYS), grid: [] };
	}, [mode, cursor]);

	const events = useMemo(
		() => calendarEvents(crm, range.from, range.to, today, include),
		[crm, range, today, include],
	);
	const byDay = useMemo(() => {
		const map = new Map<string, CalendarEvent[]>();
		for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
		return map;
	}, [events]);

	const step = (dir: 1 | -1) =>
		setCursor((c) => (mode === 'month' ? addMonths(c, dir) : addDays(c, dir * (mode === 'week' ? 7 : AGENDA_DAYS))));

	// formatRange drops repeated parts: "Sep 21 – 27, 2026", "Sep 28 – Oct 4, 2026".
	const title =
		mode === 'month'
			? fmt(cursor, { month: 'long', year: 'numeric' })
			: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatRange(
					utc(range.from),
					utc(addDays(range.to, -1)),
				);

	const schedule = (date?: string) => openScheduleModal(plugin, date ? { date } : {});
	const toggle = (c: EventCategory) =>
		setInclude((s) => {
			const next = new Set(s);
			if (next.has(c)) next.delete(c);
			else next.add(c);
			return next;
		});

	return (
		<div className="abc-calendar">
			<div className="abc-toolbar">
				<div className="abc-segmented" role="radiogroup" aria-label="Calendar layout">
					{(['month', 'week', 'agenda'] as const).map((m) => (
						<button
							key={m}
							role="radio"
							aria-checked={mode === m}
							className={mode === m ? 'is-active' : undefined}
							onClick={() => setMode(m)}
						>
							{m[0]!.toUpperCase() + m.slice(1)}
						</button>
					))}
				</div>
				<div className="abc-cal-nav">
					<button className="clickable-icon" aria-label="Previous" onClick={() => step(-1)}>
						<Icon name="chevron-left" />
					</button>
					<button onClick={() => setCursor(today)}>Today</button>
					<button className="clickable-icon" aria-label="Next" onClick={() => step(1)}>
						<Icon name="chevron-right" />
					</button>
				</div>
				<h3 className="abc-cal-title" aria-live="polite">
					{title}
				</h3>
				<button className="mod-cta" onClick={() => schedule()}>
					<Icon name="plus" /> Schedule meeting
				</button>
			</div>

			<div className="abc-cal-filters" role="group" aria-label="Show">
				{EVENT_CATEGORIES.map((c) => (
					<button
						key={c}
						className={`abc-cal-filter abc-slot-${CATEGORY_META[c].slot}`}
						aria-pressed={include.has(c)}
						onClick={() => toggle(c)}
					>
						<span className="abc-cal-key" aria-hidden="true" />
						{CATEGORY_META[c].label}
					</button>
				))}
			</div>

			{mode === 'month' && (
				<MonthGrid days={range.grid} month={cursor.slice(0, 7)} today={today} byDay={byDay} onSchedule={schedule} onMore={(d) => {
					setCursor(d);
					setMode('week');
				}} />
			)}
			{mode === 'week' && <WeekGrid days={range.grid} today={today} byDay={byDay} onSchedule={schedule} />}
			{mode === 'agenda' && <Agenda from={range.from} to={range.to} today={today} byDay={byDay} />}
		</div>
	);
}

function EventChip({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
	const openNote = useOpenNote();
	const meta = CATEGORY_META[event.category];
	return (
		<button
			className={`abc-event abc-slot-${meta.slot}${event.overdue ? ' is-overdue' : ''}${compact ? ' is-compact' : ''}`}
			title={[event.time && fmtTime(event.time), event.title, event.detail, meta.label].filter(Boolean).join(' · ')}
			onClick={(e: MouseEvent) => {
				e.stopPropagation();
				openNote(event.path, e);
			}}
		>
			<Icon name={event.overdue ? 'alert-triangle' : meta.icon} className="abc-event-icon" />
			{event.time && <span className="abc-event-time">{fmtTime(event.time)}</span>}
			<span className="abc-event-title">{event.title}</span>
			{event.overdue && <span className="abc-sr-only"> (overdue)</span>}
		</button>
	);
}

const MAX_IN_CELL = 3;

function MonthGrid({
	days,
	month,
	today,
	byDay,
	onSchedule,
	onMore,
}: {
	days: string[];
	month: string;
	today: string;
	byDay: Map<string, CalendarEvent[]>;
	onSchedule: (date: string) => void;
	onMore: (date: string) => void;
}) {
	return (
		<div className="abc-month" role="grid" aria-label="Month">
			<div className="abc-month-head" role="row">
				{days.slice(0, 7).map((d) => (
					<div key={d} role="columnheader">
						{fmt(d, { weekday: 'short' })}
					</div>
				))}
			</div>
			{[0, 1, 2, 3, 4, 5].map((w) => (
				<div key={w} className="abc-month-week" role="row">
					{days.slice(w * 7, w * 7 + 7).map((d) => {
						const events = byDay.get(d) ?? [];
						const hidden = events.length - MAX_IN_CELL;
						return (
							<div
								key={d}
								role="gridcell"
								aria-label={fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}
								className={`abc-day${d.startsWith(month) ? '' : ' is-other-month'}${d === today ? ' is-today' : ''}`}
								onDoubleClick={() => onSchedule(d)}
							>
								<div className="abc-day-head">
									<span className="abc-day-number">{Number(d.slice(8))}</span>
									<button
										className="abc-day-add clickable-icon"
										aria-label={`Schedule on ${fmt(d, { month: 'long', day: 'numeric' })}`}
										onClick={() => onSchedule(d)}
									>
										<Icon name="plus" />
									</button>
								</div>
								{events.slice(0, hidden > 0 ? MAX_IN_CELL - 1 : MAX_IN_CELL).map((e) => (
									<EventChip key={e.id} event={e} compact />
								))}
								{hidden > 0 && (
									<button className="abc-day-more" onClick={() => onMore(d)}>
										+{hidden + 1} more
									</button>
								)}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}

function WeekGrid({
	days,
	today,
	byDay,
	onSchedule,
}: {
	days: string[];
	today: string;
	byDay: Map<string, CalendarEvent[]>;
	onSchedule: (date: string) => void;
}) {
	const timed = days.flatMap((d) => (byDay.get(d) ?? []).filter((e) => e.time));
	// Show 08:00–19:00, stretched to fit any earlier or later meeting.
	const first = Math.min(8, ...timed.map((e) => Math.floor(minutes(e.time!) / 60)));
	const last = Math.max(19, ...timed.map((e) => Math.ceil((minutes(e.time!) + (e.duration ?? 30)) / 60)));
	const hours = Array.from({ length: last - first }, (_, i) => first + i);
	const now = new Date();
	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	return (
		<div className="abc-week" aria-label="Week">
			<div className="abc-week-row abc-week-head">
				<div />
				{days.map((d) => (
					<div key={d} className={`abc-week-day-head${d === today ? ' is-today' : ''}`}>
						<span className="abc-muted">{fmt(d, { weekday: 'short' })}</span> <strong>{Number(d.slice(8))}</strong>
						<button
							className="abc-day-add clickable-icon"
							aria-label={`Schedule on ${fmt(d, { month: 'long', day: 'numeric' })}`}
							onClick={() => onSchedule(d)}
						>
							<Icon name="plus" />
						</button>
					</div>
				))}
			</div>
			<div className="abc-week-row abc-week-allday">
				<div className="abc-week-gutter abc-muted">All day</div>
				{days.map((d) => (
					<div key={d} className="abc-week-allday-cell">
						{(byDay.get(d) ?? [])
							.filter((e) => !e.time)
							.map((e) => (
								<EventChip key={e.id} event={e} compact />
							))}
					</div>
				))}
			</div>
			<div className="abc-week-row abc-week-body">
				<div className="abc-week-gutter">
					{hours.map((h) => (
						<div key={h} className="abc-week-hour" style={{ height: HOUR_PX }}>
							{fmtHour(h)}
						</div>
					))}
				</div>
				{days.map((d) => (
					<div key={d} className={`abc-week-col${d === today ? ' is-today' : ''}`} style={{ height: hours.length * HOUR_PX }}>
						{hours.map((h) => (
							<div key={h} className="abc-week-slot" style={{ top: (h - first) * HOUR_PX, height: HOUR_PX }} />
						))}
						{layoutDay(byDay.get(d) ?? []).map((p) => (
							<div
								key={p.event.id}
								className="abc-week-event"
								style={{
									top: ((p.start - first * 60) / 60) * HOUR_PX,
									height: Math.max(22, ((p.end - p.start) / 60) * HOUR_PX - 2),
									left: `calc(${(100 / p.lanes) * p.lane}% + 2px)`,
									width: `calc(${100 / p.lanes}% - 4px)`,
								}}
							>
								<EventChip event={p.event} />
							</div>
						))}
						{d === today && nowMinutes >= first * 60 && nowMinutes < last * 60 && (
							<div className="abc-week-now" style={{ top: ((nowMinutes - first * 60) / 60) * HOUR_PX }} aria-hidden="true" />
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function Agenda({ from, to, today, byDay }: { from: string; to: string; today: string; byDay: Map<string, CalendarEvent[]> }) {
	const days: string[] = [];
	for (let d = from; d < to; d = addDays(d, 1)) if (byDay.has(d)) days.push(d);
	if (days.length === 0) return <div className="abc-empty">Nothing scheduled in this period.</div>;
	return (
		<div className="abc-agenda">
			{days.map((d) => (
				<section key={d} className={`abc-agenda-day${d === today ? ' is-today' : ''}`} aria-label={fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}>
					<h4>
						{d === today ? 'Today · ' : ''}
						{fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}
					</h4>
					<ul>
						{byDay.get(d)!.map((e) => (
							<li key={e.id}>
								<EventChip event={e} />
								{e.detail && <span className="abc-muted abc-agenda-detail">{e.detail}</span>}
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
