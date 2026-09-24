import { createContext } from 'react';
import type { App } from 'obsidian';
import type CrmPlugin from '../main';
import type { CrmIndex } from '../core/CrmIndex';
import type { CrmRepository } from '../core/CrmRepository';

export interface PluginContextValue {
	app: App;
	plugin: CrmPlugin;
	index: CrmIndex;
	repo: CrmRepository;
}

export const PluginContext = createContext<PluginContextValue | null>(null);
