import { useMemo, useState } from 'react';
import { isOverdue } from '../../core/billing';
import { formatDate } from '../../core/schema';
import { INVOICE_STATUSES, QUOTE_STATUSES, type Invoice, type Quote } from '../../core/types';
import { openCreateModal } from '../../obsidian/modals';
import { formatMoney, formatTotals } from '../format';
import { useCrm } from '../hooks/useCrm';
import { useOpenNote } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';
import { BillingStatus, displayStatus } from '../components/BillingStatus';
import { DataTable, type Column } from '../components/DataTable';
import { Icon } from '../components/Icon';

type Doc = Quote | Invoice;
type Tab = 'invoice' | 'quote';

interface Row {
	doc: Doc;
	companyName?: string;
	status: string;
}

/** Sums gross amounts per currency. */
function grossByCurrency(docs: Doc[], defaultCurrency: string): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const d of docs) {
		const currency = d.currency ?? defaultCurrency;
		totals[currency] = (totals[currency] ?? 0) + d.totals.gross;
	}
	return totals;
}

/** Invoices and quotes in one view, switched with a tab. */
export function BillingView({ initialTab = 'invoice' }: { initialTab?: Tab }) {
	const crm = useCrm();
	const { plugin } = usePlugin();
	const settings = useSettings();
	const openNote = useOpenNote();
	const [tab, setTab] = useState<Tab>(initialTab);
	const [status, setStatus] = useState('all');
	const [search, setSearch] = useState('');
	const today = formatDate(new Date());
	const { defaultCurrency } = settings;

	const statuses = tab === 'invoice' ? [...INVOICE_STATUSES, 'overdue'] : [...QUOTE_STATUSES];

	const rows = useMemo<Row[]>(() => {
		const q = search.trim().toLowerCase();
		return (crm.all(tab) as readonly Doc[])
			.map((doc) => ({ doc, companyName: crm.companyOf(doc.path)?.name ?? doc.company?.linkpath, status: displayStatus(doc, today) }))
			.filter((r) => status === 'all' || r.status === status)
			.filter((r) => !q || [r.doc.name, r.companyName, ...r.doc.items.map((i) => i.description)].some((s) => s?.toLowerCase().includes(q)));
	}, [crm, tab, status, search, today]);

	const invoices = crm.all('invoice');
	const outstanding = formatTotals(grossByCurrency(invoices.filter((i) => i.status === 'sent'), defaultCurrency));
	const overdue = formatTotals(grossByCurrency(invoices.filter((i) => isOverdue(i, today)), defaultCurrency));

	const columns = useMemo<Column<Row>[]>(
		() => [
			{
				id: 'number',
				header: 'Number',
				sortValue: (r) => r.doc.name,
				render: (r) => <span className="abc-cell-name">{r.doc.name}</span>,
			},
			{ id: 'company', header: 'Company', sortValue: (r) => r.companyName?.toLowerCase(), render: (r) => r.companyName },
			{ id: 'issued', header: 'Issued', sortValue: (r) => r.doc.issued, render: (r) => r.doc.issued },
			tab === 'invoice'
				? {
						id: 'due',
						header: 'Due',
						sortValue: (r) => (r.doc as Invoice).due,
						render: (r) => (r.doc as Invoice).due,
					}
				: {
						id: 'validUntil',
						header: 'Valid until',
						sortValue: (r) => (r.doc as Quote).validUntil,
						render: (r) => (r.doc as Quote).validUntil,
					},
			{ id: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <BillingStatus doc={r.doc} /> },
			{
				id: 'total',
				header: 'Total',
				sortValue: (r) => r.doc.totals.gross,
				render: (r) => (
					<span className="abc-num">{formatMoney(r.doc.totals.gross, r.doc.currency ?? defaultCurrency)}</span>
				),
			},
		],
		[tab, defaultCurrency],
	);

	const label = tab === 'invoice' ? 'invoice' : 'quote';

	return (
		<div className="abc-list-view">
			<div className="abc-toolbar">
				<div className="abc-segmented" role="tablist" aria-label="Document type">
					{(['invoice', 'quote'] as const).map((t) => (
						<button
							key={t}
							role="tab"
							aria-selected={tab === t}
							className={tab === t ? 'is-active' : undefined}
							onClick={() => {
								setTab(t);
								setStatus('all');
							}}
						>
							{t === 'invoice' ? 'Invoices' : 'Quotes'}
						</button>
					))}
				</div>
				<input
					type="search"
					className="abc-search"
					placeholder={`Search ${label}s…`}
					aria-label={`Search ${label}s`}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select className="dropdown" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
					<option value="all">All statuses</option>
					{statuses.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
				<button className="mod-cta" onClick={() => openCreateModal(plugin, tab)}>
					<Icon name="plus" /> New {label}
				</button>
			</div>
			{tab === 'invoice' && (outstanding || overdue) && (
				<div className="abc-billing-summary">
					{outstanding && (
						<span>
							Outstanding <strong>{outstanding}</strong>
						</span>
					)}
					{overdue && (
						<span className="abc-overdue">
							<Icon name="alert-triangle" /> Overdue <strong>{overdue}</strong>
						</span>
					)}
				</div>
			)}
			{rows.length === 0 ? (
				<div className="abc-empty">
					{crm.count(tab) === 0 ? `No ${label}s yet.` : `No ${label}s match the current filters.`}
				</div>
			) : (
				<DataTable
					// Columns differ per tab, so start each tab with a fresh sort.
					key={tab}
					rows={rows}
					columns={columns}
					rowKey={(r) => r.doc.path}
					onRowOpen={(r, e) => openNote(r.doc.path, e)}
					initialSort={{ id: 'issued', desc: true }}
				/>
			)}
		</div>
	);
}
