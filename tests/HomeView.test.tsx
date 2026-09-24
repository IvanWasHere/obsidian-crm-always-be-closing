import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { PluginContext } from '../src/ui/context';
import { HomeView } from '../src/ui/views/HomeView';
import type CrmPlugin from '../src/main';
import { setup } from './fixtures';

function renderHome(notes?: Parameters<typeof setup>[0]) {
	const ctx = setup(notes);
	const plugin = { settings: ctx.settings } as unknown as CrmPlugin;
	render(
		<PluginContext.Provider
			value={{ app: ctx.app as unknown as ObsidianApp, plugin, index: ctx.index, repo: ctx.repo }}
		>
			<HomeView />
		</PluginContext.Provider>,
	);
	return ctx;
}

describe('HomeView', () => {
	it('shows entity counts from the index', () => {
		renderHome();
		expect(screen.getByTestId('stat-contact')).toHaveTextContent('3');
		expect(screen.getByTestId('stat-company')).toHaveTextContent('2');
		expect(screen.getByTestId('stat-deal')).toHaveTextContent('2');
		expect(screen.getByTestId('stat-interaction')).toHaveTextContent('2');
	});

	it('updates when the index publishes', () => {
		const { app, index } = renderHome({});
		expect(screen.getByTestId('stat-deal')).toHaveTextContent('0');
		act(() => {
			app.vault.addNote('CRM/Deals/Acme - Pilot.md', { type: 'crm-deal', stage: 'lead' });
			index.flush();
		});
		expect(screen.getByTestId('stat-deal')).toHaveTextContent('1');
	});
});
