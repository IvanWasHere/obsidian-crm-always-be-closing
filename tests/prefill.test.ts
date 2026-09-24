import { describe, expect, it } from 'vitest';
import { contextValues } from '../src/obsidian/prefill';
import type CrmPlugin from '../src/main';
import { setup } from './fixtures';

function withActive(path: string | null) {
	const ctx = setup();
	ctx.app.workspace.activeFile = path ? ctx.app.vault.file(path) : null;
	return { app: ctx.app, index: ctx.index } as unknown as CrmPlugin;
}

describe('contextValues', () => {
	it('pre-fills from the active note', () => {
		const deal = withActive('CRM/Deals/Acme - Pilot.md');
		expect(contextValues(deal, 'interaction')).toEqual({
			deal: ['CRM/Deals/Acme - Pilot.md'],
			contacts: ['CRM/Contacts/Jane Doe.md', 'CRM/Contacts/Maria Garcia.md'],
		});
		expect(contextValues(deal, 'deal')).toEqual({ company: ['CRM/Companies/Acme Inc.md'] });

		const jane = withActive('CRM/Contacts/Jane Doe.md');
		expect(contextValues(jane, 'deal')).toEqual({
			contacts: ['CRM/Contacts/Jane Doe.md'],
			company: ['CRM/Companies/Acme Inc.md'],
		});
		expect(contextValues(jane, 'interaction')).toEqual({ contacts: ['CRM/Contacts/Jane Doe.md'] });

		expect(contextValues(withActive('CRM/Companies/Globex.md'), 'contact')).toEqual({
			company: ['CRM/Companies/Globex.md'],
		});
		expect(contextValues(withActive(null), 'deal')).toEqual({});
	});
});
