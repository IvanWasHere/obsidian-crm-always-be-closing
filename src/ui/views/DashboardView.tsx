import { useMemo, type ReactNode } from 'react';
import { Notice } from 'obsidian';
import { addDays } from '../../core/dates';
import { closingSoon, followUps, openDeals, staleContacts, totalsByCurrency } from '../../core/insights';
import { isOverdue } from '../../core/billing';
import { calendarEvents } from '../../core/calendar';
import { formatDate } from '../../core/schema';
import type { Contact, Deal, Invoice } from '../../core/types';
import { openLogInteractionModal } from '../../obsidian/modals';
import { formatMoney, formatTotals, relativeDay } from '../format';
import { useCrm } from '../hooks/useCrm';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';
import { Icon } from '../components/Icon';
import { NoteLink } from '../components/NoteLink';

/** Deals expected to close within this many days are listed. */
const CLOSING_WINDOW_DAYS = 30;

/** Home view: what needs attention today. */
export function DashboardView() {
	const crm = useCrm();
	const { staleAfterDays, defaultCurrency } = useSettings();
	const today = formatDate(new Date());

	const due = useMemo(() => followUps(crm, today), [crm, today]);
	const stale = useMemo(() => staleContacts(crm, today, staleAfterDays), [crm, today, staleAfterDays]);
	const closing = useMemo(() => closingSoon(crm, today, CLOSING_WINDOW_DAYS), [crm, today]);
	const open = useMemo(() => openDeals(crm), [crm]);
	const meetings = useMemo(
		() => calendarEvents(crm, today, addDays(today, 7), today, new Set(['meeting'])),
		[crm, today],
	);
	const unpaid = crm.all('invoice').filter((i) => i.status === 'sent');
	const overdue = unpaid.filter((i) => isOverdue(i, today)).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
	const outstanding: Record<string, number> = {};
	for (const i of unpaid) {
		const c = i.currency ?? defaultCurrency;
		outstanding[c] = (outstanding[c] ?? 0) + i.totals.gross;
	}

	const nothingDue = due.overdue.length + due.today.length + due.thisWeek.length === 0;

	return (
		<div className="abc-dashboard">
			<div className="abc-stats">
				<Stat id="contacts" label="Contacts" value={crm.all('contact').filter((c) => c.status !== 'archived').length} />
				<Stat id="companies" label="Companies" value={crm.count('company')} />
				<Stat id="open-deals" label="Open deals" value={open.length} />
				<Stat
					id="pipeline"
					label="Open pipeline"
					value={formatTotals(totalsByCurrency(open, defaultCurrency)) || '—'}
				/>
				{unpaid.length > 0 && <Stat id="outstanding" label="Outstanding invoices" value={formatTotals(outstanding)} />}
			</div>

			{overdue.length > 0 && (
				<Panel title="Overdue invoices" icon="alert-triangle" count={overdue.length}>
					<ul className="abc-rows">
						{overdue.map((i) => (
							<InvoiceRow key={i.path} invoice={i} today={today} defaultCurrency={defaultCurrency} />
						))}
					</ul>
				</Panel>
			)}

			<Panel title="Upcoming meetings" icon="calendar-clock" count={meetings.length}>
				{meetings.length === 0 ? (
					<div className="abc-muted">No meetings in the next 7 days.</div>
				) : (
					<ul className="abc-rows">
						{meetings.map((m) => (
							<li key={m.id} className="abc-row">
								<div className="abc-row-main">
									<NoteLink path={m.path}>{m.title}</NoteLink>
									<div className="abc-row-detail abc-muted">
										{[
											relativeDay(m.date, today),
											m.time &&
												new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
													new Date(`2000-01-01T${m.time}:00Z`),
												),
											m.detail,
										]
											.filter(Boolean)
											.join(' · ')}
									</div>
								</div>
							</li>
						))}
					</ul>
				)}
			</Panel>

			<Panel title="Follow-ups" icon="bell">
				{nothingDue && <div className="abc-muted">Nothing due this week.</div>}
				<FollowUpGroup title="Overdue" contacts={due.overdue} today={today} tone="error" />
				<FollowUpGroup title="Today" contacts={due.today} today={today} />
				<FollowUpGroup title="This week" contacts={due.thisWeek} today={today} />
			</Panel>

			<Panel title={`No contact in ${staleAfterDays}+ days`} icon="hourglass" count={stale.length}>
				{stale.length === 0 ? (
					<div className="abc-muted">Every active contact has been touched recently or has a follow-up.</div>
				) : (
					<ul className="abc-rows">
						{stale.map((c) => (
							<ContactRow
								key={c.path}
								contact={c}
								detail={c.lastContacted ? `last contacted ${relativeDay(c.lastContacted, today)}` : 'never contacted'}
								actions={<ScheduleButton contact={c} today={today} />}
							/>
						))}
					</ul>
				)}
			</Panel>

			<Panel title="Closing soon" icon="target" count={closing.length}>
				{closing.length === 0 ? (
					<div className="abc-muted">No open deals expected to close in the next {CLOSING_WINDOW_DAYS} days.</div>
				) : (
					<ul className="abc-rows">
						{closing.map((d) => (
							<DealRow key={d.path} deal={d} today={today} defaultCurrency={defaultCurrency} />
						))}
					</ul>
				)}
			</Panel>
		</div>
	);
}

function Stat({ id, label, value }: { id: string; label: string; value: ReactNode }) {
	return (
		<div className="abc-stat" data-testid={`stat-${id}`}>
			<div className="abc-stat-value">{value}</div>
			<div className="abc-stat-label">{label}</div>
		</div>
	);
}

function Panel({ title, icon, count, children }: { title: string; icon: string; count?: number; children: ReactNode }) {
	return (
		<section className="abc-dashboard-panel" aria-label={title}>
			<h3>
				<Icon name={icon} /> {title}
				{count !== undefined && count > 0 && <span className="abc-muted"> {count}</span>}
			</h3>
			{children}
		</section>
	);
}

function FollowUpGroup({
	title,
	contacts,
	today,
	tone,
}: {
	title: string;
	contacts: Contact[];
	today: string;
	tone?: 'error';
}) {
	const { repo } = usePlugin();
	if (contacts.length === 0) return null;

	const setFollowUp = (c: Contact, date: string | undefined) => {
		repo.updateFields(c.path, { next_follow_up: date ?? null }).catch((err: unknown) => {
			new Notice(err instanceof Error ? err.message : String(err));
		});
	};

	return (
		<div className="abc-group" aria-label={title}>
			<h4 className={tone === 'error' ? 'abc-overdue' : undefined}>
				{title} <span className="abc-muted">{contacts.length}</span>
			</h4>
			<ul className="abc-rows">
				{contacts.map((c) => (
					<ContactRow
						key={c.path}
						contact={c}
						detail={relativeDay(c.nextFollowUp!, today)}
						actions={
							<>
								<button onClick={() => setFollowUp(c, addDays(today, 7))} title="Move the follow-up to a week from today">
									Snooze 1 week
								</button>
								<button onClick={() => setFollowUp(c, undefined)} title="Clear the follow-up date">
									Done
								</button>
							</>
						}
					/>
				))}
			</ul>
		</div>
	);
}

function ContactRow({ contact, detail, actions }: { contact: Contact; detail: string; actions: ReactNode }) {
	const crm = useCrm();
	const { plugin } = usePlugin();
	const company = crm.companyOf(contact.path);
	return (
		<li className="abc-row">
			<div className="abc-row-main">
				<NoteLink path={contact.path}>{contact.name}</NoteLink>
				{company && <span className="abc-muted"> · {company.name}</span>}
				<div className="abc-row-detail abc-muted">{detail}</div>
			</div>
			<div className="abc-row-actions">
				<button onClick={() => openLogInteractionModal(plugin, { contacts: [contact.path] })}>Log</button>
				{actions}
			</div>
		</li>
	);
}

function ScheduleButton({ contact, today }: { contact: Contact; today: string }) {
	const { repo } = usePlugin();
	return (
		<button
			title="Set a follow-up for a week from today"
			onClick={() => {
				repo.updateFields(contact.path, { next_follow_up: addDays(today, 7) }).catch((err: unknown) => {
					new Notice(err instanceof Error ? err.message : String(err));
				});
			}}
		>
			Follow up next week
		</button>
	);
}

function DealRow({ deal, today, defaultCurrency }: { deal: Deal; today: string; defaultCurrency: string }) {
	const crm = useCrm();
	const company = crm.companyOf(deal.path);
	const overdue = deal.expectedClose! < today;
	return (
		<li className="abc-row">
			<div className="abc-row-main">
				<NoteLink path={deal.path}>{deal.name}</NoteLink>
				{company && <span className="abc-muted"> · {company.name}</span>}
				<div className="abc-row-detail abc-muted">
					{deal.stage}
					{deal.value !== undefined && <> · {formatMoney(deal.value, deal.currency ?? defaultCurrency)}</>}
					{' · '}
					<span className={overdue ? 'abc-overdue' : undefined}>closes {relativeDay(deal.expectedClose!, today)}</span>
				</div>
			</div>
		</li>
	);
}

function InvoiceRow({ invoice, today, defaultCurrency }: { invoice: Invoice; today: string; defaultCurrency: string }) {
	const crm = useCrm();
	const { repo } = usePlugin();
	const company = crm.companyOf(invoice.path);
	return (
		<li className="abc-row">
			<div className="abc-row-main">
				<NoteLink path={invoice.path}>{invoice.name}</NoteLink>
				{company && <span className="abc-muted"> · {company.name}</span>}
				<div className="abc-row-detail abc-muted">
					{formatMoney(invoice.totals.gross, invoice.currency ?? defaultCurrency)} ·{' '}
					<span className="abc-overdue">due {relativeDay(invoice.due!, today)}</span>
				</div>
			</div>
			<div className="abc-row-actions">
				<button
					onClick={() => {
						repo.markPaid(invoice.path).catch((err: unknown) => {
							new Notice(err instanceof Error ? err.message : String(err));
						});
					}}
				>
					Mark paid
				</button>
			</div>
		</li>
	);
}
