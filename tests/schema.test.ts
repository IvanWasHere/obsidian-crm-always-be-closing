import { describe, expect, it } from 'vitest';
import { parseEntity, parseWikilink, parseWikilinks, typeFromTag } from '../src/core/schema';
import { DEFAULT_SETTINGS } from '../src/settings';

const opts = { stages: DEFAULT_SETTINGS.pipelineStages };

describe('parseWikilink', () => {
	it('parses plain, aliased and heading links', () => {
		expect(parseWikilink('[[Acme Inc]]')).toEqual({ linkpath: 'Acme Inc' });
		expect(parseWikilink('[[CRM/Companies/Acme Inc|Acme]]')).toEqual({ linkpath: 'CRM/Companies/Acme Inc', alias: 'Acme' });
		expect(parseWikilink('[[Acme Inc#History]]')).toEqual({ linkpath: 'Acme Inc' });
	});

	it('accepts a bare name', () => {
		expect(parseWikilink('Acme Inc')).toEqual({ linkpath: 'Acme Inc' });
	});

	it('handles unquoted YAML links, which parse as nested arrays', () => {
		expect(parseWikilink([['Acme Inc']])).toEqual({ linkpath: 'Acme Inc' });
		expect(parseWikilinks([['Jane Doe']])).toEqual([{ linkpath: 'Jane Doe' }]);
		expect(parseWikilinks([[['Jane Doe']], [['John Smith']]])).toEqual([
			{ linkpath: 'Jane Doe' },
			{ linkpath: 'John Smith' },
		]);
	});

	it('rejects empty and non-string values', () => {
		expect(parseWikilink('[[]]')).toBeUndefined();
		expect(parseWikilink(42)).toBeUndefined();
	});
});

describe('typeFromTag', () => {
	it('maps crm-* types', () => {
		expect(typeFromTag('crm-project')).toBe('project');
		expect(typeFromTag('daily')).toBeNull();
	});
});

describe('parseEntity', () => {
	it('parses a contact', () => {
		const contact = parseEntity(
			'contact',
			'CRM/Contacts/Jane Doe.md',
			{
				type: 'crm-contact',
				name: 'Jane Doe',
				email: 'jane@acme.com',
				phone: '+1 555 0100',
				company: '[[Acme Inc]]',
				tags: ['lead', '#conference-2026'],
				status: 'Active',
				last_contacted: '2026-09-20',
				next_follow_up: '2026-10-01T09:00',
			},
			opts,
		);
		expect(contact).toEqual({
			type: 'contact',
			path: 'CRM/Contacts/Jane Doe.md',
			name: 'Jane Doe',
			email: 'jane@acme.com',
			phone: '+1 555 0100',
			company: { linkpath: 'Acme Inc' },
			tags: ['lead', 'conference-2026'],
			status: 'active',
			lastContacted: '2026-09-20',
			nextFollowUp: '2026-10-01',
			issues: [],
			frontmatter: expect.objectContaining({ name: 'Jane Doe' }) as unknown,
		});
	});

	it('falls back to the file name and defaults', () => {
		const contact = parseEntity('contact', 'CRM/Contacts/Bob.md', undefined, opts);
		expect(contact).toMatchObject({ name: 'Bob', status: 'active', tags: [], issues: [] });
	});

	it('reports invalid fields without dropping the entity', () => {
		const contact = parseEntity(
			'contact',
			'c.md',
			{ status: 'hot', last_contacted: 'yesterday', company: 12, tags: 'a, b' },
			opts,
		);
		expect(contact).toMatchObject({ status: 'active', tags: ['a', 'b'] });
		expect(contact).not.toHaveProperty('lastContacted');
		expect(contact.issues).toEqual([
			'company should be a link like "[[Name]]"',
			'status "hot" should be one of: active, cold, archived',
			'last_contacted should be a date (YYYY-MM-DD)',
		]);
	});

	it('parses a project and validates stage and numbers', () => {
		const project = parseEntity(
			'project',
			'd.md',
			{ contacts: ['[[Jane Doe]]', 5], stage: 'proposal', value: '12,000', currency: 'eur', probability: 0.4 },
			opts,
		);
		expect(project).toMatchObject({
			contacts: [{ linkpath: 'Jane Doe' }],
			stage: 'proposal',
			value: 12000,
			currency: 'EUR',
			probability: 0.4,
			issues: ['contacts has entries that are not links'],
		});

		const odd = parseEntity('project', 'd.md', { stage: 'maybe', value: 'lots', probability: 40 }, opts);
		expect(odd).toMatchObject({ stage: 'maybe' });
		expect(odd.issues).toEqual([
			'stage "maybe" is not in the pipeline stages',
			'probability should be between 0 and 1',
			'value should be a number',
		]);

		const noStage = parseEntity('project', 'd.md', {}, opts);
		expect(noStage).toMatchObject({ stage: 'lead', issues: ['stage is missing; treated as "lead"'] });
	});

	it('parses an interaction', () => {
		const interaction = parseEntity(
			'interaction',
			'i.md',
			{ kind: 'call', date: new Date('2026-09-20'), contacts: '[[Jane Doe]]', project: '[[Acme - Pilot]]', summary: 'Scope' },
			opts,
		);
		expect(interaction).toMatchObject({
			kind: 'call',
			date: '2026-09-20',
			contacts: [{ linkpath: 'Jane Doe' }],
			project: { linkpath: 'Acme - Pilot' },
			summary: 'Scope',
			issues: [],
		});
	});
});
