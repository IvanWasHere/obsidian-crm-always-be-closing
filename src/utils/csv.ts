/**
 * RFC 4180 CSV: quoted fields may contain commas, newlines and doubled quotes.
 * Also accepts a UTF-8 BOM, CRLF or LF line endings, and `;` or tab delimiters
 * (detected from the first line). Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
	const input = text.replace(/^\uFEFF/, '');
	const delimiter = detectDelimiter(input);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i]!;
		if (quoted) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"' && field === '') {
			quoted = true;
		} else if (ch === delimiter) {
			row.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && input[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += ch;
		}
	}
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function detectDelimiter(text: string): string {
	const firstLine = text.slice(0, text.search(/\r?\n|$/));
	const count = (d: string) => firstLine.split(d).length - 1;
	const candidates = [',', ';', '\t'];
	return candidates.reduce((best, d) => (count(d) > count(best) ? d : best), ',');
}

/** Serialises rows as CSV with CRLF line endings, quoting only where needed. */
export function toCsv(rows: readonly (readonly string[])[]): string {
	const escape = (cell: string) => (/[",\r\n]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
	return rows.map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';
}
