import type { CrmSnapshot } from './CrmSnapshot';
import { addDays } from './dates';
import type { Contact, DateString, Deal } from './types';

/** `won`, `lost` and `closed …` stages end a deal; everything else is open. */
export function isClosedStage(stage: string): boolean {
	const s = stage.trim().toLowerCase();
	return s === 'won' || s === 'lost' || s.startsWith('closed');
}

export function openDeals(crm: CrmSnapshot): Deal[] {
	return crm.all('deal').filter((d) => !isClosedStage(d.stage));
}

export interface FollowUps {
	overdue: Contact[];
	today: Contact[];
	/** Due in the next 7 days, after today. */
	thisWeek: Contact[];
}

/** Contacts with a `next_follow_up`, grouped by when it's due. Archived contacts are skipped. */
export function followUps(crm: CrmSnapshot, today: DateString): FollowUps {
	const weekEnd = addDays(today, 7);
	const result: FollowUps = { overdue: [], today: [], thisWeek: [] };
	for (const c of crm.all('contact')) {
		const due = c.nextFollowUp;
		if (!due || c.status === 'archived') continue;
		if (due < today) result.overdue.push(c);
		else if (due === today) result.today.push(c);
		else if (due <= weekEnd) result.thisWeek.push(c);
	}
	const byDue = (a: Contact, b: Contact) => a.nextFollowUp!.localeCompare(b.nextFollowUp!) || a.name.localeCompare(b.name);
	result.overdue.sort(byDue);
	result.thisWeek.sort(byDue);
	return result;
}

/**
 * Active contacts not touched in `days` days (or never) that have no
 * follow-up scheduled. Oldest touch first; never-contacted first of all.
 */
export function staleContacts(crm: CrmSnapshot, today: DateString, days: number): Contact[] {
	const cutoff = addDays(today, -days);
	return crm
		.all('contact')
		.filter((c) => c.status === 'active' && !c.nextFollowUp && (!c.lastContacted || c.lastContacted < cutoff))
		.sort((a, b) => (a.lastContacted ?? '').localeCompare(b.lastContacted ?? '') || a.name.localeCompare(b.name));
}

/** Open deals expected to close within `days` days, including overdue ones. Soonest first. */
export function closingSoon(crm: CrmSnapshot, today: DateString, days: number): Deal[] {
	const until = addDays(today, days);
	return openDeals(crm)
		.filter((d) => d.expectedClose !== undefined && d.expectedClose <= until)
		.sort((a, b) => a.expectedClose!.localeCompare(b.expectedClose!));
}

/** Deal values summed per currency, e.g. `{ EUR: 62000, USD: 5000 }`. Deals without a value are skipped. */
export function totalsByCurrency(deals: readonly Deal[], defaultCurrency: string): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const d of deals) {
		if (d.value === undefined) continue;
		const currency = d.currency ?? defaultCurrency;
		totals[currency] = (totals[currency] ?? 0) + d.value;
	}
	return totals;
}
