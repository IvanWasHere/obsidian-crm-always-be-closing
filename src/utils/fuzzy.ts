/**
 * Scores how well `query` matches `text`: higher is better, null means no match.
 * Substring matches beat scattered ones; matches at word starts rank higher.
 */
export function fuzzyScore(query: string, text: string): number | null {
	const q = query.trim().toLowerCase();
	const t = text.toLowerCase();
	if (!q) return 0;

	const at = t.indexOf(q);
	if (at !== -1) {
		const wordStart = at === 0 || /[\s\-_.@]/.test(t[at - 1]!);
		return 1000 - at + (wordStart ? 500 : 0) - (t.length - q.length);
	}

	// All query characters in order, fewer gaps is better.
	let score = 0;
	let pos = -1;
	for (const ch of q) {
		if (ch === ' ') continue;
		const next = t.indexOf(ch, pos + 1);
		if (next === -1) return null;
		score -= next - pos - 1;
		pos = next;
	}
	return score;
}

/** Items that match, best first. */
export function fuzzyFilter<T>(query: string, items: readonly T[], text: (item: T) => string, limit = Infinity): T[] {
	if (!query.trim()) return items.slice(0, limit);
	return items
		.map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
		.filter((m): m is { item: T; score: number } => m.score !== null)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((m) => m.item);
}
