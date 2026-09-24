import type { LineItemInput } from '../../core/fields';
import { totalsOf } from '../../core/billing';
import { useSettings } from '../hooks/useSettings';

interface Props {
	value: LineItemInput[];
	onChange: (items: LineItemInput[]) => void;
	/** Called when focus leaves the editor (not when moving between its cells). */
	onCommit?: () => void;
	id?: string;
}

const num = (s: string, fallback: number) => {
	const n = Number(s.replace(/[\s_]/g, '').replace(',', '.'));
	return s.trim() === '' || !Number.isFinite(n) ? fallback : n;
};

const amount = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Editable table of line items with running totals. */
export function LineItemsEditor({ value, onChange, onCommit, id }: Props) {
	const settings = useSettings();
	const rows = value;
	const parsed = rows.map((r) => ({
		description: r.description,
		qty: num(r.qty, 1),
		price: num(r.price, 0),
		tax: num(r.tax, 0),
	}));
	const totals = totalsOf(parsed);

	const update = (i: number, key: keyof LineItemInput, text: string) =>
		onChange(rows.map((r, j) => (j === i ? { ...r, [key]: text } : r)));

	return (
		<div
			className="abc-items"
			id={id}
			onBlur={(e) => {
				if (onCommit && !e.currentTarget.contains(e.relatedTarget)) onCommit();
			}}
		>
			<table>
				<thead>
					<tr>
						<th>Description</th>
						<th className="abc-num">Qty</th>
						<th className="abc-num">Price</th>
						<th className="abc-num">Tax %</th>
						<th className="abc-num">Amount</th>
						<th>
							<span className="abc-sr-only">Remove</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={i}>
							<td>
								<input
									type="text"
									aria-label={`Line ${i + 1} description`}
									value={row.description}
									onChange={(e) => update(i, 'description', e.target.value)}
								/>
							</td>
							<td>
								<input
									type="text"
									inputMode="decimal"
									className="abc-num"
									aria-label={`Line ${i + 1} quantity`}
									value={row.qty}
									onChange={(e) => update(i, 'qty', e.target.value)}
								/>
							</td>
							<td>
								<input
									type="text"
									inputMode="decimal"
									className="abc-num"
									aria-label={`Line ${i + 1} price`}
									value={row.price}
									onChange={(e) => update(i, 'price', e.target.value)}
								/>
							</td>
							<td>
								<input
									type="text"
									inputMode="decimal"
									className="abc-num"
									aria-label={`Line ${i + 1} tax`}
									value={row.tax}
									onChange={(e) => update(i, 'tax', e.target.value)}
								/>
							</td>
							<td className="abc-num">{amount(parsed[i]!.qty * parsed[i]!.price)}</td>
							<td>
								<button
									type="button"
									className="clickable-icon"
									aria-label={`Remove line ${i + 1}`}
									onClick={() => onChange(rows.filter((_, j) => j !== i))}
								>
									×
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="abc-items-footer">
				<button
					type="button"
					onClick={() =>
						onChange([...rows, { description: '', qty: '1', price: '', tax: String(settings.billing.defaultTaxRate) }])
					}
				>
					Add line
				</button>
				<dl className="abc-totals">
					<dt>Net</dt>
					<dd>{amount(totals.net)}</dd>
					<dt>Tax</dt>
					<dd>{amount(totals.tax)}</dd>
					<dt>Total</dt>
					<dd className="abc-total-gross">{amount(totals.gross)}</dd>
				</dl>
			</div>
		</div>
	);
}
