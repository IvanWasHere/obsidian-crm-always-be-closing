import type { jsPDF } from 'jspdf';
import regular from '../../assets/fonts/NotoSans-Regular.ttf';
import bold from '../../assets/fonts/NotoSans-Bold.ttf';

/** Noto Sans, cut down to the Latin alphabets (see scripts/subset-fonts.sh). */
export const FONT = 'NotoSans';

export function registerFonts(pdf: jsPDF) {
	pdf.addFileToVFS('NotoSans-Regular.ttf', regular);
	pdf.addFont('NotoSans-Regular.ttf', FONT, 'normal');
	pdf.addFileToVFS('NotoSans-Bold.ttf', bold);
	pdf.addFont('NotoSans-Bold.ttf', FONT, 'bold');
}
