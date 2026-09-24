import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { App } from './mocks/obsidian';
import { PluginContext } from '../src/ui/context';
import { HomeView } from '../src/ui/views/HomeView';
import { DEFAULT_SETTINGS } from '../src/settings';
import type CrmPlugin from '../src/main';

function renderHome(files: string[]) {
	const app = new App(files);
	const plugin = { settings: DEFAULT_SETTINGS } as unknown as CrmPlugin;
	render(
		<PluginContext.Provider value={{ app: app as unknown as ObsidianApp, plugin }}>
			<HomeView />
		</PluginContext.Provider>,
	);
	return app;
}

describe('HomeView', () => {
	it('counts notes per CRM folder', () => {
		renderHome([
			'CRM/Contacts/Jane Doe.md',
			'CRM/Contacts/John Smith.md',
			'CRM/Companies/Acme Inc.md',
			'CRM/Contacts/photo.png',
			'Daily/2026-09-25.md',
		]);

		expect(screen.getByTestId('stat-contacts')).toHaveTextContent('2');
		expect(screen.getByTestId('stat-companies')).toHaveTextContent('1');
		expect(screen.getByTestId('stat-deals')).toHaveTextContent('0');
	});

	it('updates when a note is created', () => {
		const app = renderHome([]);
		act(() => {
			app.vault.addFile('CRM/Deals/Acme - Pilot.md');
		});
		expect(screen.getByTestId('stat-deals')).toHaveTextContent('1');
	});
});
