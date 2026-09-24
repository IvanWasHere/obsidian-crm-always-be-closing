import { Notice } from 'obsidian';
import { nextNumber } from '../../core/billing';
import { formatDate } from '../../core/schema';
import type { Invoice, Quote } from '../../core/types';
import { useCrm } from '../hooks/useCrm';
import { usePlugin } from '../hooks/usePlugin';
import { useSettings } from '../hooks/useSettings';
import { Icon } from './Icon';
import { exportAndOpenPdf, pdfPathFor } from '../../obsidian/pdf';

/** The next steps for a quote or invoice, depending on its status. */
export function BillingActions({ doc }: { doc: Quote | Invoice }) {
	const { repo, app, plugin } = usePlugin();
	const hasPdf = app.vault.getFileByPath(pdfPathFor(doc)) !== null;
	const crm = useCrm();
	const settings = useSettings();

	const run = (action: () => Promise<unknown>) => {
		action().catch((err: unknown) => new Notice(err instanceof Error ? err.message : String(err)));
	};

	const convert = () =>
		run(async () => {
			const file = await repo.convertQuoteToInvoice(
				doc as Quote,
				crm,
				nextNumber(crm, 'invoice', settings, formatDate(new Date())),
			);
			await app.workspace.getLeaf(false).openFile(file);
		});

	return (
		<>
			<button onClick={() => void exportAndOpenPdf(plugin, doc)} title="Saved next to this note">
				<Icon name="file-down" /> {hasPdf ? 'Update PDF' : 'Create PDF'}
			</button>
			{doc.status === 'draft' && (
				<button onClick={() => run(() => repo.markSent(doc.path))}>
					<Icon name="send" /> Mark as sent
				</button>
			)}
			{doc.type === 'invoice' && doc.status === 'sent' && (
				<button className="mod-cta" onClick={() => run(() => repo.markPaid(doc.path))}>
					<Icon name="check-check" /> Mark as paid
				</button>
			)}
			{doc.type === 'quote' && doc.status === 'sent' && (
				<>
					<button onClick={() => run(() => repo.setQuoteStatus(doc.path, 'accepted'))}>
						<Icon name="check" /> Accepted
					</button>
					<button onClick={() => run(() => repo.setQuoteStatus(doc.path, 'declined'))}>
						<Icon name="x" /> Declined
					</button>
				</>
			)}
			{doc.type === 'quote' && doc.status !== 'declined' && doc.status !== 'expired' && (
				<button onClick={convert}>
					<Icon name="file-plus" /> Create invoice
				</button>
			)}
		</>
	);
}
