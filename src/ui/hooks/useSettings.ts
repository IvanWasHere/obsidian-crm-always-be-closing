import { useSyncExternalStore } from 'react';
import type { CrmSettings } from '../../settings';
import { usePlugin } from './usePlugin';

/** Current settings; re-renders when they're saved. Treat as read-only. */
export function useSettings(): CrmSettings {
	const { plugin } = usePlugin();
	return useSyncExternalStore(plugin.subscribeSettings, plugin.getSettingsSnapshot);
}
