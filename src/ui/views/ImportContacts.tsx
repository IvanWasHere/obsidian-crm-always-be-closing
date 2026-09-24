import { useId, useMemo, useState } from 'react';
import { Notice } from 'obsidian';
import { autoMap, importTargets, planImport, runImport, toTable, type CsvTable, type Mapping } from '../../core/csvImport';
import { parseCsv } from '../../utils/csv';
import { useCrm } from '../hooks/useCrm';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';

/**
 * Imports contacts from a CSV file: pick a file, check the column mapping
 * (guessed from the headers), review the summary, import.
 */
export function ImportContacts({ onDone }: { onDone: () => void }) {
	const crm = useCrm();
	const settings = useSettings();
	const { repo } = usePlugin();
	const id = useId();
	const targets = useMemo(() => importTargets(settings), [settings]);

	const [table, setTable] = useState<CsvTable | null>(null);
	const [mapping, setMapping] = useState<Mapping>({});
	const [createCompanies, setCreateCompanies] = useState(true);
	const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
	const [error, setError] = useState<string | null>(null);

	const plan = useMemo(() => (table ? planImport(table, mapping, crm) : null), [table, mapping, crm]);

	const loadFile = async (file: File) => {
		setError(null);
		const parsed = toTable(parseCsv(await file.text()));
		if (parsed.headers.length === 0 || parsed.rows.length === 0) {
			setTable(null);
			setError('That file has no rows to import.');
			return;
		}
		setTable(parsed);
		setMapping(autoMap(parsed.headers, targets));
	};

	const start = async () => {
		if (!plan) return;
		setProgress({ done: 0, total: plan.contacts.length });
		let result;
		try {
			result = await runImport(plan, crm, repo, {
				createCompanies,
				onProgress: (done, total) => setProgress({ done, total }),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setProgress(null);
			return;
		}
		const parts = [`Imported ${result.contacts} contacts`];
		if (result.companies) parts.push(`${result.companies} companies`);
		new Notice(parts.join(' and ') + (result.failed.length ? `. ${result.failed.length} failed (see console).` : '.'));
		if (result.failed.length) console.warn('[Always Be Closing] Import failures', result.failed);
		onDone();
	};

	const sample = table?.rows[0] ?? [];
	const nameMapped = (mapping.name ?? -1) >= 0 || (mapping.first_name ?? -1) >= 0 || (mapping.last_name ?? -1) >= 0;

	return (
		<div className="abc-import">
			<p className="abc-muted">
				Works with LinkedIn (Connections.csv) and Google Contacts exports, or any CSV with a header row.
				Contacts that already exist (same email or name) are skipped.
			</p>
			<input
				type="file"
				accept=".csv,text/csv"
				aria-label="CSV file"
				disabled={progress !== null}
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void loadFile(file);
				}}
			/>
			{error && (
				<div className="abc-form-error" role="alert">
					{error}
				</div>
			)}

			{table && plan && (
				<>
					<table className="abc-mapping">
						<thead>
							<tr>
								<th>Field</th>
								<th>CSV column</th>
								<th>First row</th>
							</tr>
						</thead>
						<tbody>
							{targets.map((t) => {
								const col = mapping[t.key] ?? -1;
								return (
									<tr key={t.key}>
										<td>
											<label htmlFor={`${id}-${t.key}`}>{t.label}</label>
										</td>
										<td>
											<select
												id={`${id}-${t.key}`}
												className="dropdown"
												value={col}
												disabled={progress !== null}
												onChange={(e) => setMapping((m) => ({ ...m, [t.key]: Number(e.target.value) }))}
											>
												<option value={-1}>—</option>
												{table.headers.map((h, i) => (
													<option key={i} value={i}>
														{h || `Column ${i + 1}`}
													</option>
												))}
											</select>
										</td>
										<td className="abc-muted">{col >= 0 ? sample[col] : ''}</td>
									</tr>
								);
							})}
						</tbody>
					</table>

					{plan.newCompanies.length > 0 && (
						<label className="abc-checkbox-row">
							<input
								type="checkbox"
								checked={createCompanies}
								disabled={progress !== null}
								onChange={(e) => setCreateCompanies(e.target.checked)}
							/>
							Create {plan.newCompanies.length} new {plan.newCompanies.length === 1 ? 'company' : 'companies'}
						</label>
					)}

					<p className="abc-import-summary" role="status">
						{!nameMapped
							? 'Map a name column (or first and last name) to import.'
							: `Will create ${plan.contacts.length} ${plan.contacts.length === 1 ? 'contact' : 'contacts'}.` +
								(plan.duplicates ? ` ${plan.duplicates} already exist and will be skipped.` : '') +
								(plan.unnamed ? ` ${plan.unnamed} rows have no name and will be skipped.` : '')}
					</p>

					<div className="modal-button-container">
						<button
							className="mod-cta"
							disabled={!nameMapped || plan.contacts.length === 0 || progress !== null}
							onClick={() => void start()}
						>
							{progress ? `Importing ${progress.done} of ${progress.total}…` : 'Import'}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
