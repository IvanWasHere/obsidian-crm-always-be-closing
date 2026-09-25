import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customFieldProblem, fieldsFor, slugifyKey, type CustomField } from '../src/core/fields';
import { mergeSettings } from '../src/settings';
import { setup } from './fixtures';

// New notes get `created: <today>`; pin today so expectations are exact.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-25T12:00:00'));
});
afterEach(() => {
	vi.useRealTimers();
});


describe('custom fields', () => {
	it('slugifies labels into keys', () => {
		expect(slugifyKey('LinkedIn URL')).toBe('linkedin_url');
		expect(slugifyKey('  Café Owner! ')).toBe('cafe_owner');
	});

	it('reports unusable keys', () => {
		const f = (key: string): CustomField => ({ key, label: key, kind: 'text' });
		expect(customFieldProblem('contact', f(''), [])).toBe('Needs a key.');
		expect(customFieldProblem('contact', f('1abc'), [])).toMatch(/must start with a letter/);
		expect(customFieldProblem('contact', f('email'), [])).toBe('"email" is a built-in field.');
		expect(customFieldProblem('contact', f('type'), [])).toBe('"type" is a built-in field.');
		expect(customFieldProblem('contact', f('x'), [f('x'), f('x')])).toBe('Key "x" is used twice.');
		expect(customFieldProblem('company', f('email'), [])).toBeNull();
	});

	it('appends valid custom fields after the built-in ones', () => {
		const settings = mergeSettings({
			customFields: {
				contact: [
					{ key: 'birthday', label: 'Birthday', kind: 'date' },
					{ key: 'email', label: 'Clash', kind: 'text' },
					{ key: 'tier', label: 'Tier', kind: 'select', options: ['A', 'B'] },
				],
			},
		});
		const specs = fieldsFor('contact', settings);
		const custom = specs.filter((s) => s.custom);
		expect(custom.map((s) => s.key)).toEqual(['birthday', 'tier']);
		expect(custom[1]!.options!(settings)).toEqual(['A', 'B']);
		expect(specs[0]!.key).toBe('name');
	});

	it('cleans up saved custom fields', () => {
		const settings = mergeSettings({
			customFields: { project: [{ key: 'source', kind: 'bogus' }, { label: 'no key' }, 'junk'] },
		});
		expect(settings.customFields.project).toEqual([{ key: 'source', label: 'source', kind: 'text' }]);
		expect(settings.customFields.contact).toEqual([]);
	});

	it('writes custom fields when creating notes', async () => {
		const { app, repo, settings } = setup({});
		settings.customFields.company.push(
			{ key: 'employees', label: 'Employees', kind: 'number' },
			{ key: 'partner', label: 'Partner', kind: 'checkbox' },
		);
		const file = await repo.createEntity('company', { name: 'Initech', employees: '250', partner: 'true' });
		expect(app.vault.readNote(file.path)?.frontmatter).toEqual({
			type: 'crm-company',
			name: 'Initech',
			employees: 250,
			partner: true,
			created: '2026-09-25',
		});
	});
});
