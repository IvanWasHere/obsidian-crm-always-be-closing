import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type CrmPlugin from '../main';
import { PluginContext } from '../ui/context';

/** Mounts React UI into an Obsidian element with the plugin context provided. */
export function mountReact(el: HTMLElement, plugin: CrmPlugin, node: ReactNode): Root {
	const root = createRoot(el);
	root.render(
		<StrictMode>
			<PluginContext.Provider value={{ app: plugin.app, plugin, index: plugin.index, repo: plugin.repo }}>
				{node}
			</PluginContext.Provider>
		</StrictMode>,
	);
	return root;
}
