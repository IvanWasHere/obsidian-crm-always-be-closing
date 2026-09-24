import { Notice, normalizePath, type TFile } from 'obsidian';
import type CrmPlugin from '../main';
import { invoiceDocument } from '../core/invoiceDocument';
import type { Invoice, Quote } from '../core/types';
import { renderInvoice, type Logo } from '../pdf/renderInvoice';

/** The PDF sits next to its note: `INV-2026-0001 Acme Inc.md` → `INV-2026-0001 Acme Inc.pdf`. */
export function pdfPathFor(doc: Quote | Invoice): string {
	return doc.path.replace(/\.md$/i, '.pdf');
}

async function readLogo(plugin: CrmPlugin): Promise<Logo | undefined> {
	const path = plugin.settings.billing.logoPath.trim();
	if (!path) return undefined;
	const file = plugin.app.vault.getFileByPath(normalizePath(path));
	const ext = file?.extension.toLowerCase();
	if (!file || !ext || !['png', 'jpg', 'jpeg'].includes(ext)) {
		new Notice(`Logo not found or not a PNG/JPEG: ${path}`);
		return undefined;
	}
	return { data: new Uint8Array(await plugin.app.vault.readBinary(file)), format: ext === 'png' ? 'PNG' : 'JPEG' };
}

/** Renders a quote or invoice to PDF next to its note (replacing an older one) and returns the file. */
export async function exportBillingPdf(plugin: CrmPlugin, doc: Quote | Invoice): Promise<TFile> {
	const { vault } = plugin.app;
	const data = invoiceDocument(doc, plugin.index.getSnapshot(), plugin.settings);
	const bytes = renderInvoice(data, await readLogo(plugin));
	const path = pdfPathFor(doc);
	const existing = vault.getFileByPath(path);
	if (existing) {
		await vault.modifyBinary(existing, bytes);
		return existing;
	}
	return vault.createBinary(path, bytes);
}

/** Exports and opens the PDF in a new tab, reporting failures as a notice. */
export async function exportAndOpenPdf(plugin: CrmPlugin, doc: Quote | Invoice): Promise<void> {
	try {
		if (!plugin.settings.billing.businessName) {
			new Notice('Tip: add your business details in the plugin settings so they appear on the PDF.');
		}
		const file = await exportBillingPdf(plugin, doc);
		await plugin.app.workspace.getLeaf('tab').openFile(file);
	} catch (err) {
		new Notice(`Couldn't create the PDF: ${err instanceof Error ? err.message : String(err)}`);
	}
}
