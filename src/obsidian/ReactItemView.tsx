import { StrictMode, type ReactNode } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type CrmPlugin from '../main';
import { PluginContext } from '../ui/context';

/**
 * Base class for Obsidian views rendered with React.
 * Subclasses only implement `renderView()`; mounting, context and
 * unmounting are handled here.
 */
export abstract class ReactItemView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		protected plugin: CrmPlugin,
	) {
		super(leaf);
	}

	protected abstract renderView(): ReactNode;

	async onOpen() {
		this.contentEl.addClass('vault-crm-view');
		this.root = createRoot(this.contentEl);
		const { plugin } = this;
		this.root.render(
			<StrictMode>
				<PluginContext.Provider value={{ app: this.app, plugin, index: plugin.index, repo: plugin.repo }}>
					{this.renderView()}
				</PluginContext.Provider>
			</StrictMode>,
		);
	}

	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
