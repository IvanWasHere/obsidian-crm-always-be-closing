import type { ReactNode } from 'react';
import { Modal } from 'obsidian';
import type { Root } from 'react-dom/client';
import type CrmPlugin from '../main';
import { mountReact } from './mountReact';

/** A modal whose content is React. `render` gets a `close` callback. */
export class ReactModal extends Modal {
	private root: Root | null = null;

	constructor(
		private plugin: CrmPlugin,
		title: string,
		private render: (close: () => void) => ReactNode,
	) {
		super(plugin.app);
		this.setTitle(title);
	}

	onOpen() {
		this.modalEl.addClass('abc-modal');
		this.root = mountReact(this.contentEl, this.plugin, this.render(() => this.close()));
	}

	onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
