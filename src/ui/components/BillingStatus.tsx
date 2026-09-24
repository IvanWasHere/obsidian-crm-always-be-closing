import { isOverdue } from '../../core/billing';
import { formatDate } from '../../core/schema';
import type { Invoice, Quote } from '../../core/types';
import { Icon } from './Icon';

const ICONS: Record<string, string> = {
	draft: 'pencil',
	sent: 'send',
	accepted: 'check',
	declined: 'x',
	expired: 'clock',
	paid: 'check-check',
	void: 'ban',
	overdue: 'alert-triangle',
};

/** `overdue` for sent invoices past their due date, otherwise the stored status. */
export function displayStatus(doc: Quote | Invoice, today = formatDate(new Date())): string {
	return doc.type === 'invoice' && isOverdue(doc, today) ? 'overdue' : doc.status;
}

/** Status with an icon and label, so meaning never rests on color alone. */
export function BillingStatus({ doc }: { doc: Quote | Invoice }) {
	const status = displayStatus(doc);
	return (
		<span className={`abc-doc-status abc-doc-status-${status}`}>
			<Icon name={ICONS[status] ?? 'circle'} /> {status}
		</span>
	);
}
