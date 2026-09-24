import { useMemo, useState } from 'react';
import { formatDate } from '../../core/schema';
import type { Contact, ContactStatus } from '../../core/types';
import { openCreateModal } from '../../obsidian/modals';
import { useCrm } from '../hooks/useCrm';
import { useOpenNote } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { DataTable, type Column } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { NoteLink } from '../components/NoteLink';

interface Row {
	contact: Contact;
	/** Resolved company note, if the link points at one. */
	companyPath?: string;
	/** Company name, or the raw link text when it doesn't resolve. */
	companyName?: string;
}

type StatusFilter = 'open' | 'all' | ContactStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: 'open', label: 'Active and cold' },
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'cold', label: 'Cold' },
	{ value: 'archived', label: 'Archived' },
];

function matchesStatus(contact: Contact, filter: StatusFilter) {
	if (filter === 'all') return true;
	if (filter === 'open') return contact.status !== 'archived';
	return contact.status === filter;
}

function matchesSearch({ contact, companyName }: Row, query: string) {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return [contact.name, contact.email, contact.role, companyName, ...contact.tags].some((s) =>
		s?.toLowerCase().includes(q),
	);
}

export function ContactsView() {
	const crm = useCrm();
	const { plugin } = usePlugin();
	const openNote = useOpenNote();
	const [search, setSearch] = useState('');
	const [status, setStatus] = useState<StatusFilter>('open');
	const today = formatDate(new Date());

	const rows = useMemo<Row[]>(
		() =>
			crm
				.all('contact')
				.filter((c) => matchesStatus(c, status))
				.map((contact) => {
					const company = crm.companyOf(contact.path);
					return { contact, companyPath: company?.path, companyName: company?.name ?? contact.company?.linkpath };
				})
				.filter((row) => matchesSearch(row, search)),
		[crm, status, search],
	);

	const columns = useMemo<Column<Row>[]>(
		() => [
			{
				id: 'name',
				header: 'Name',
				sortValue: (r) => r.contact.name.toLowerCase(),
				render: (r) => <span className="abc-cell-name">{r.contact.name}</span>,
			},
			{
				id: 'company',
				header: 'Company',
				sortValue: (r) => r.companyName?.toLowerCase(),
				render: ({ companyPath, companyName }) =>
					companyPath ? (
						<NoteLink path={companyPath}>{companyName}</NoteLink>
					) : (
						<span className="abc-muted">{companyName}</span>
					),
			},
			{ id: 'role', header: 'Role', sortValue: (r) => r.contact.role?.toLowerCase(), render: (r) => r.contact.role },
			{
				id: 'status',
				header: 'Status',
				sortValue: (r) => r.contact.status,
				render: (r) => <span className={`abc-status abc-status-${r.contact.status}`}>{r.contact.status}</span>,
			},
			{
				id: 'lastContacted',
				header: 'Last contacted',
				sortValue: (r) => r.contact.lastContacted,
				render: (r) => r.contact.lastContacted,
			},
			{
				id: 'nextFollowUp',
				header: 'Next follow-up',
				sortValue: (r) => r.contact.nextFollowUp,
				render: ({ contact }) => {
					const date = contact.nextFollowUp;
					const overdue = date !== undefined && date < today && contact.status !== 'archived';
					return <span className={overdue ? 'abc-overdue' : undefined}>{date}</span>;
				},
			},
			{
				id: 'tags',
				header: 'Tags',
				render: (r) => (
					<span className="abc-tags">
						{r.contact.tags.map((t) => (
							<span key={t} className="abc-tag">
								{t}
							</span>
						))}
					</span>
				),
			},
		],
		[today],
	);

	return (
		<div className="abc-list-view">
			<div className="abc-toolbar">
				<input
					type="search"
					className="abc-search"
					placeholder="Search contacts…"
					aria-label="Search contacts"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					className="dropdown"
					aria-label="Status"
					value={status}
					onChange={(e) => setStatus(e.target.value as StatusFilter)}
				>
					{STATUS_FILTERS.map((f) => (
						<option key={f.value} value={f.value}>
							{f.label}
						</option>
					))}
				</select>
				<span className="abc-count">
					{rows.length} {rows.length === 1 ? 'contact' : 'contacts'}
				</span>
				<button className="mod-cta" onClick={() => openCreateModal(plugin, 'contact')}>
					<Icon name="plus" /> New contact
				</button>
			</div>

			{rows.length === 0 ? (
				<div className="abc-empty">
					{crm.count('contact') === 0 ? 'No contacts yet.' : 'No contacts match the current filters.'}
				</div>
			) : (
				<DataTable
					rows={rows}
					columns={columns}
					rowKey={(r) => r.contact.path}
					onRowOpen={(r, e) => openNote(r.contact.path, e)}
					initialSort={{ id: 'name', desc: false }}
				/>
			)}
		</div>
	);
}
