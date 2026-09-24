import { jsPDF } from 'jspdf';
import type { InvoiceDocument } from '../core/invoiceDocument';
import { FONT, registerFonts } from './fonts';

export interface Logo {
	data: Uint8Array;
	format: 'PNG' | 'JPEG';
}

// A4 in millimetres.
const PAGE_W = 210;
const PAGE_H = 297;
const M = 18; // margin
const RIGHT = PAGE_W - M;
const BOTTOM = PAGE_H - 24; // content stops above the footer

const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const RULE = '#d9d9d9';

/** Column right edges (qty, price, tax, amount) and the description width. */
const COLS = { desc: M, qty: 128, price: 156, tax: 170, amount: RIGHT };
const DESC_WIDTH = COLS.qty - M - 16;

const LINE = 4.6; // body line height at 9.5pt

/** Draws an invoice or quote and returns the PDF bytes. */
export function renderInvoice(d: InvoiceDocument, logo?: Logo): ArrayBuffer {
	const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
	registerFonts(pdf);
	pdf.setProperties({ title: `${d.title} ${d.number}`, creator: 'Always Be Closing' });

	const text = (s: string | string[], x: number, y: number, opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' } = {}) => {
		pdf.setFont(FONT, opts.bold ? 'bold' : 'normal');
		pdf.setFontSize(opts.size ?? 9.5);
		pdf.setTextColor(opts.color ?? INK);
		pdf.text(s, x, y, { align: opts.align ?? 'left', baseline: 'top' });
	};
	const rule = (y: number, x1 = M, x2 = RIGHT) => {
		pdf.setDrawColor(RULE);
		pdf.setLineWidth(0.2);
		pdf.line(x1, y, x2, y);
	};

	// ---- Header: logo or business name on the left, title and details on the right.
	let left = M;
	if (logo) {
		const props = pdf.getImageProperties(logo.data);
		const scale = Math.min(50 / props.width, 18 / props.height);
		const w = props.width * scale;
		const h = props.height * scale;
		pdf.addImage(logo.data, logo.format, M, M, w, h);
		left = M + h + 4;
	} else if (d.from[0]) {
		text(d.from[0], M, M, { size: 14, bold: true });
		left = M + 8;
	}
	const fromLines = logo ? d.from : d.from.slice(1);
	if (fromLines.length) {
		text(fromLines, M, left, { size: 8.5, color: MUTED });
		left += fromLines.length * 4;
	}

	text(d.title.toUpperCase(), RIGHT, M, { size: 20, bold: true, align: 'right' });
	text(d.number, RIGHT, M + 9, { size: 10, align: 'right' });
	let right = M + 16;
	for (const m of d.meta) {
		text(m.label, 150, right, { size: 8.5, color: MUTED, align: 'right' });
		text(m.value, RIGHT, right, { size: 8.5, align: 'right' });
		right += 4.5;
	}

	// ---- Recipient
	let y = Math.max(left, right) + 8;
	text(d.title === 'Invoice' ? 'BILL TO' : 'PREPARED FOR', M, y, { size: 7.5, bold: true, color: MUTED });
	y += 5;
	if (d.to.length) {
		text(d.to[0]!, M, y, { bold: true });
		text(d.to.slice(1), M, y + LINE, { size: 9 });
		y += LINE + (d.to.length - 1) * 4.3;
	}
	y += 8;

	// ---- Line items
	const header = () => {
		const [desc, qty, price, tax, amount] = d.columns;
		const o = { size: 7.5, bold: true, color: MUTED };
		text(desc!.toUpperCase(), COLS.desc, y, o);
		text(qty!.toUpperCase(), COLS.qty, y, { ...o, align: 'right' });
		text(price!.toUpperCase(), COLS.price, y, { ...o, align: 'right' });
		text(tax!.toUpperCase(), COLS.tax, y, { ...o, align: 'right' });
		text(amount!.toUpperCase(), COLS.amount, y, { ...o, align: 'right' });
		y += 5;
		rule(y);
		y += 2.5;
	};
	const newPage = () => {
		pdf.addPage();
		y = M;
	};

	header();
	for (const row of d.rows) {
		pdf.setFont(FONT, 'normal');
		pdf.setFontSize(9.5);
		const desc = pdf.splitTextToSize(row[0] || '—', DESC_WIDTH) as string[];
		const h = desc.length * LINE + 2.5;
		if (y + h > BOTTOM) {
			newPage();
			header();
		}
		text(desc, COLS.desc, y);
		text(row[1]!, COLS.qty, y, { align: 'right' });
		text(row[2]!, COLS.price, y, { align: 'right' });
		text(row[3]!, COLS.tax, y, { align: 'right', color: MUTED });
		text(row[4]!, COLS.amount, y, { align: 'right' });
		y += h;
		rule(y - 1.2);
	}

	// ---- Totals, right-aligned under the amount column
	y += 3;
	if (y + d.totals.length * 6 + 4 > BOTTOM) newPage();
	for (const t of d.totals) {
		if (t.strong) {
			rule(y, 110);
			y += 2.5;
		}
		const size = t.strong ? 11 : 9;
		text(t.label, 150, y, { size, bold: t.strong, color: t.strong ? INK : MUTED, align: 'right' });
		text(t.value, RIGHT, y, { size, bold: t.strong, align: 'right' });
		y += t.strong ? 7 : 5;
	}

	// ---- Notes (payment details, validity)
	y += 6;
	for (const note of d.notes) {
		pdf.setFont(FONT, 'normal');
		pdf.setFontSize(9);
		const body = note.lines.flatMap((l) => pdf.splitTextToSize(l, PAGE_W - 2 * M) as string[]);
		const h = (note.title ? 5 : 0) + body.length * 4.3 + 4;
		if (y + h > BOTTOM) newPage();
		if (note.title) {
			text(note.title.toUpperCase(), M, y, { size: 7.5, bold: true, color: MUTED });
			y += 5;
		}
		text(body, M, y, { size: 9 });
		y += body.length * 4.3 + 4;
	}

	// ---- Footer on every page
	const pages = pdf.getNumberOfPages();
	for (let p = 1; p <= pages; p++) {
		pdf.setPage(p);
		rule(PAGE_H - 16);
		if (d.footer) text(d.footer, M, PAGE_H - 13, { size: 7.5, color: MUTED });
		text(`${d.number} · Page ${p} of ${pages}`, RIGHT, PAGE_H - 13, { size: 7.5, color: MUTED, align: 'right' });
	}

	return pdf.output('arraybuffer');
}
