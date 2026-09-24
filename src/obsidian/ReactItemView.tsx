import type { ReactNode } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';
import type CrmPlugin from '../main';
import { mountReact } from './mountReact';

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
		this.contentEl.addClass('abc-view');
		this.root = mountReact(this.contentEl, this.plugin, this.renderView());
	}

	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
