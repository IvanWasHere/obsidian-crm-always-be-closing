import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarEvents, layoutDay, monthGrid, weekStart, type CalendarEvent } from '../src/core/calendar';
import { toIcs } from '../src/core/ics';
import { parseEntity } from '../src/core/schema';
import { SEED, setup } from './fixtures';

const TODAY = '2026-09-25';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

const NOTES = {
	...SEED,
	'CRM/Interactions/2026-09-29 Meeting with Jane Doe.md': {
		type: 'crm-interaction',
		kind: 'meeting',
		date: '2026-09-29',
		time: '14:30',
		duration: 45,
		location: 'Acme HQ, Room 2',
		contacts: ['[[Jane Doe]]'],
		project: '[[Acme - Pilot]]',
		summary: 'Pilot review',
	},
	'CRM/Interactions/2026-10-01 Call with John Smith.md': {
		type: 'crm-interaction',
		kind: 'call',
		date: '2026-10-01',
		contacts: ['[[John Smith]]'],
	},
	'CRM/Invoices/I.md': { type: 'crm-invoice', number: 'INV-1', status: 'sent', due: '2026-09-20', total: 10 },
	'CRM/Projects/Acme - Pilot.md': { ...SEED['CRM/Projects/Acme - Pilot.md'], expected_close: '2026-09-30' },
};

describe('time field', () => {
	it('accepts HH:MM and YAML sexagesimal numbers', () => {
		const p = (time: unknown) => parseEntity('interaction', 'i.md', { time }, { stages: [] });
		expect(p('9:05')).toMatchObject({ time: '09:05' });
		expect(p(870)).toMatchObject({ time: '14:30' });
		expect(p('25:00').issues).toEqual(['time should be a time (HH:MM)']);
	});
});

describe('calendarEvents', () => {
	it('collects meetings, activity, follow-ups, invoice dues and project closes', () => {
		const { index } = setup(NOTES);
		const events = calendarEvents(index.getSnapshot(), '2026-09-01', '2026-10-06', TODAY);
		expect(events.map((e) => [e.date, e.category, e.title, e.overdue ?? false])).toEqual([
			['2026-09-10', 'interaction', 'Email with Maria Garcia', false],
			['2026-09-15', 'follow-up', 'Follow up: John Smith', true],
			['2026-09-20', 'invoice-due', 'INV-1 due', true],
			['2026-09-20', 'interaction', 'Call with Jane Doe', false],
			['2026-09-29', 'meeting', 'Pilot review', false],
			['2026-09-30', 'project-close', 'Close: Acme – Pilot', false],
			['2026-10-01', 'meeting', 'Call with John Smith', false], // future call → scheduled
			['2026-10-01', 'follow-up', 'Follow up: Jane Doe', false],
		]);
		const meeting = events.find((e) => e.category === 'meeting')!;
		expect(meeting).toMatchObject({ time: '14:30', duration: 45, detail: 'Jane Doe · Acme HQ, Room 2' });
	});

	it('filters by category and range', () => {
		const { index } = setup(NOTES);
		const events = calendarEvents(index.getSnapshot(), '2026-09-29', '2026-09-30', TODAY, new Set(['meeting']));
		expect(events.map((e) => e.title)).toEqual(['Pilot review']);
	});
});

describe('grid helpers', () => {
	it('starts weeks on Monday and shows six weeks per month', () => {
		expect(weekStart(TODAY)).toBe('2026-09-21');
		const grid = monthGrid(TODAY);
		expect(grid).toHaveLength(42);
		expect(grid[0]).toBe('2026-08-31');
		expect(grid[41]).toBe('2026-10-11');
	});

	it('puts overlapping meetings side by side', () => {
		const ev = (id: string, time: string, duration: number): CalendarEvent => ({
			id,
			category: 'meeting',
			path: id,
			date: TODAY,
			time,
			duration,
			title: id,
		});
		const placed = layoutDay([ev('a', '09:00', 60), ev('b', '09:30', 60), ev('c', '10:00', 30), ev('d', '13:00', 30)]);
		const lanes = Object.fromEntries(placed.map((p) => [p.event.id, [p.lane, p.lanes]]));
		// a and b overlap; c starts when a ends so it reuses a's lane; d stands alone.
		expect(lanes).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
	});
});

describe('toIcs', () => {
	it('writes a timed event with attendees, escaping and folding', () => {
		const { index } = setup({
			...NOTES,
			'CRM/Contacts/Jane Doe.md': { ...SEED['CRM/Contacts/Jane Doe.md'], email: 'jane@acme.com' },
		});
		const crm = index.getSnapshot();
		const meeting = crm.get('CRM/Interactions/2026-09-29 Meeting with Jane Doe.md', 'interaction')!;
		const ics = toIcs([meeting], crm, new Date('2026-09-25T10:00:00Z'));
		const lines = ics.split('\r\n');

		expect(lines[0]).toBe('BEGIN:VCALENDAR');
		expect(lines).toContain('DTSTART:20260929T143000');
		expect(lines).toContain('DTEND:20260929T151500');
		expect(lines).toContain('DTSTAMP:20260925T100000Z');
		expect(lines).toContain('SUMMARY:Pilot review');
		expect(lines).toContain('LOCATION:Acme HQ\\, Room 2');
		expect(lines).toContain('DESCRIPTION:With: Jane Doe\\nProject: Acme – Pilot');
		expect(lines).toContain('ATTENDEE;CN=Jane Doe;RSVP=TRUE:mailto:jane@acme.com');
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
	});

	it('writes untimed events as all-day and keeps the UID stable', () => {
		const { index } = setup(NOTES);
		const crm = index.getSnapshot();
		const call = crm.get('CRM/Interactions/2026-10-01 Call with John Smith.md', 'interaction')!;
		const a = toIcs([call], crm);
		expect(a).toContain('DTSTART;VALUE=DATE:20261001');
		expect(a).toContain('DTEND;VALUE=DATE:20261002');
		expect(a).toContain('SUMMARY:Call with John Smith');
		const uid = (s: string) => /UID:(.*)/.exec(s)![1];
		expect(uid(toIcs([call], crm))).toBe(uid(a));
	});

	it('folds long lines at 75 octets without splitting characters', () => {
		const { index } = setup(NOTES);
		const crm = index.getSnapshot();
		const meeting = crm.get('CRM/Interactions/2026-09-29 Meeting with Jane Doe.md', 'interaction')!;
		const long = { ...meeting, summary: 'Đ'.repeat(60) };
		const ics = toIcs([long], crm);
		const summary = ics.split('\r\n').filter((l, i, all) => l.startsWith('SUMMARY') || (l.startsWith(' ') && all[i - 1]?.startsWith('SUMMARY')));
		expect(summary.length).toBeGreaterThan(1);
		expect(summary.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(`SUMMARY:${'Đ'.repeat(60)}`);
	});
});

describe('scheduling in the future', () => {
	it('does not move last_contacted forward', async () => {
		const { app, repo } = setup();
		await repo.logInteraction({ kind: 'meeting', date: '2026-10-10', time: '10:00', contacts: ['CRM/Contacts/Jane Doe.md'] });
		expect(app.vault.readNote('CRM/Contacts/Jane Doe.md')?.frontmatter?.last_contacted).toBe('2026-09-20');
		await repo.logInteraction({ kind: 'call', date: '2026-09-25', contacts: ['CRM/Contacts/Jane Doe.md'] });
		expect(app.vault.readNote('CRM/Contacts/Jane Doe.md')?.frontmatter?.last_contacted).toBe('2026-09-25');
	});
});
