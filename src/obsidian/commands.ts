import type CrmPlugin from '../main';

export function registerCommands(plugin: CrmPlugin) {
	plugin.addCommand({
		id: 'open-home',
		name: 'Open home',
		callback: () => {
			void plugin.activateHomeView();
		},
	});
}
