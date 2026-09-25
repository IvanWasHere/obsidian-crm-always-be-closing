import { describe, expect, it } from 'vitest';
import { addDays, daysBetween } from '../src/core/dates';
import { closingSoon, followUps, isClosedStage, staleContacts, totalsByCurrency } from '../src/core/insights';
import type { Project } from '../src/core/types';
import { setup } from './fixtures';

const TODAY = '2026-09-25';
const names = (list: readonly { name: string }[]) => list.map((e) => e.name);

describe('dates', () => {
	it('adds days across month and year ends', () => {
		expect(addDays('2026-09-25', 7)).toBe('2026-10-02');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
		expect(daysBetween('2026-09-25', '2026-10-02')).toBe(7);
		expect(daysBetween('2026-10-02', '2026-09-25')).toBe(-7);
	});
});

describe('insights', () => {
	it('recognises closed stages', () => {
		expect(['won', 'Lost', 'closed won', 'Closed-lost'].every(isClosedStage)).toBe(true);
		expect(['lead', 'proposal', 'negotiation'].some(isClosedStage)).toBe(false);
	});

	it('groups follow-ups by due date and skips archived contacts', () => {
		const { index } = setup({
			'CRM/Contacts/Late.md': { next_follow_up: '2026-09-20' },
			'CRM/Contacts/Later.md': { next_follow_up: '2026-09-01' },
			'CRM/Contacts/Now.md': { next_follow_up: TODAY },
			'CRM/Contacts/Soon.md': { next_follow_up: '2026-10-02' },
			'CRM/Contacts/Far.md': { next_follow_up: '2026-10-03' },
			'CRM/Contacts/Gone.md': { next_follow_up: '2026-09-01', status: 'archived' },
		});
		const due = followUps(index.getSnapshot(), TODAY);
		expect(names(due.overdue)).toEqual(['Later', 'Late']);
		expect(names(due.today)).toEqual(['Now']);
		expect(names(due.thisWeek)).toEqual(['Soon']);
	});

	it('lists stale active contacts without a follow-up, oldest first', () => {
		const { index } = setup({
			'CRM/Contacts/Fresh.md': { last_contacted: '2026-09-10' },
			'CRM/Contacts/Old.md': { last_contacted: '2026-06-01' },
			'CRM/Contacts/Older.md': { last_contacted: '2026-01-01' },
			'CRM/Contacts/Never.md': {},
			'CRM/Contacts/Planned.md': { last_contacted: '2026-01-01', next_follow_up: '2026-10-10' },
			'CRM/Contacts/Cold.md': { last_contacted: '2026-01-01', status: 'cold' },
		});
		expect(names(staleContacts(index.getSnapshot(), TODAY, 30))).toEqual(['Never', 'Older', 'Old']);
	});

	it('lists open projects closing soon, including overdue ones', () => {
		const { index } = setup({
			'CRM/Projects/A.md': { stage: 'proposal', expected_close: '2026-10-20' },
			'CRM/Projects/B.md': { stage: 'lead', expected_close: '2026-09-01' },
			'CRM/Projects/C.md': { stage: 'won', expected_close: '2026-09-30' },
			'CRM/Projects/D.md': { stage: 'lead', expected_close: '2026-12-01' },
			'CRM/Projects/E.md': { stage: 'lead' },
		});
		expect(names(closingSoon(index.getSnapshot(), TODAY, 30))).toEqual(['B', 'A']);
	});

	it('sums values per currency', () => {
		const projects = [{ value: 100, currency: 'USD' }, { value: 50 }, { value: 25, currency: 'USD' }, {}] as Project[];
		expect(totalsByCurrency(projects, 'EUR')).toEqual({ USD: 125, EUR: 50 });
	});
});
