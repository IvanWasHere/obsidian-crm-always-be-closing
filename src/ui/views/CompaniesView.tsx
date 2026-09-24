import { useMemo, useState } from 'react';
import { isClosedStage, totalsByCurrency } from '../../core/insights';
import type { Company } from '../../core/types';
import { openCreateModal } from '../../obsidian/modals';
import { formatTotals } from '../format';
import { useCrm } from '../hooks/useCrm';
import { useOpenNote } from '../hooks/useObsidian';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';
import { DataTable, type Column } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { customColumns } from '../components/customColumns';
import { fieldsFor } from '../../core/fields';

interface Row {
	company: Company;
	contacts: number;
	openDeals: number;
	/** Display string, e.g. `€12,000 · $5,000`. */
	pipeline: string;
	/** Sum of open deal values regardless of currency, for sorting only. */
	pipelineSum: number;
	lastInteraction?: string;
}

function matchesSearch({ company }: Row, query: string) {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return [company.name, company.domain, company.industry, ...company.tags].some((s) => s?.toLowerCase().includes(q));
}

/** All companies with their contacts, open deals and latest interaction rolled up. */
export function CompaniesView() {
	const crm = useCrm();
	const { plugin } = usePlugin();
	const openNote = useOpenNote();
	const [search, setSearch] = useState('');
	const settings = useSettings();
	const { defaultCurrency } = settings;

	const rows = useMemo<Row[]>(
		() =>
			crm
				.all('company')
				.map((company) => {
					const open = crm.dealsOf(company.path).filter((d) => !isClosedStage(d.stage));
					return {
						company,
						contacts: crm.contactsOf(company.path).length,
						openDeals: open.length,
						pipeline: formatTotals(totalsByCurrency(open, defaultCurrency)),
						pipelineSum: open.reduce((sum, d) => sum + (d.value ?? 0), 0),
						lastInteraction: crm.interactionsOf(company.path)[0]?.date,
					};
				})
				.filter((row) => matchesSearch(row, search)),
		[crm, search, defaultCurrency],
	);

	const columns = useMemo<Column<Row>[]>(
		() => [
			{
				id: 'name',
				header: 'Name',
				sortValue: (r) => r.company.name.toLowerCase(),
				render: (r) => <span className="abc-cell-name">{r.company.name}</span>,
			},
			{
				id: 'industry',
				header: 'Industry',
				sortValue: (r) => r.company.industry?.toLowerCase(),
				render: (r) => r.company.industry,
			},
			{ id: 'contacts', header: 'Contacts', sortValue: (r) => r.contacts, render: (r) => r.contacts },
			{ id: 'openDeals', header: 'Open deals', sortValue: (r) => r.openDeals, render: (r) => r.openDeals },
			{
				id: 'pipeline',
				header: 'Pipeline',
				sortValue: (r) => (r.pipelineSum > 0 ? r.pipelineSum : undefined),
				render: (r) => r.pipeline,
			},
			{
				id: 'lastInteraction',
				header: 'Last interaction',
				sortValue: (r) => r.lastInteraction,
				render: (r) => r.lastInteraction,
			},
			{
				id: 'tags',
				header: 'Tags',
				render: (r) => (
					<span className="abc-tags">
						{r.company.tags.map((t) => (
							<span key={t} className="abc-tag">
								{t}
							</span>
						))}
					</span>
				),
			},
			...customColumns<Row>(fieldsFor('company', settings), (r) => r.company),
		],
		[settings],
	);

	return (
		<div className="abc-list-view">
			<div className="abc-toolbar">
				<input
					type="search"
					className="abc-search"
					placeholder="Search companies…"
					aria-label="Search companies"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<span className="abc-count">
					{rows.length} {rows.length === 1 ? 'company' : 'companies'}
				</span>
				<button className="mod-cta" onClick={() => openCreateModal(plugin, 'company')}>
					<Icon name="plus" /> New company
				</button>
			</div>
			{rows.length === 0 ? (
				<div className="abc-empty">
					{crm.count('company') === 0 ? 'No companies yet.' : 'No companies match the search.'}
				</div>
			) : (
				<DataTable
					rows={rows}
					columns={columns}
					rowKey={(r) => r.company.path}
					onRowOpen={(r, e) => openNote(r.company.path, e)}
					initialSort={{ id: 'name', desc: false }}
				/>
			)}
		</div>
	);
}
