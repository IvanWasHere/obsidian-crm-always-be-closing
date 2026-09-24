import { useContext } from 'react';
import { PluginContext, type PluginContextValue } from '../context';

export function usePlugin(): PluginContextValue {
	const ctx = useContext(PluginContext);
	if (!ctx) throw new Error('usePlugin must be used inside a ReactItemView');
	return ctx;
}
