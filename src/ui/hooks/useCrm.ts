import { useSyncExternalStore } from 'react';
import type { CrmSnapshot } from '../../core/CrmSnapshot';
import type { EntityOfType, EntityType } from '../../core/types';
import { usePlugin } from './usePlugin';

/** The current CRM snapshot; re-renders whenever the index publishes a new one. */
export function useCrm(): CrmSnapshot {
	const { index } = usePlugin();
	return useSyncExternalStore(index.subscribe, index.getSnapshot);
}

/** All entities of a type (sorted by name; interactions newest first). */
export function useEntities<T extends EntityType>(type: T): readonly EntityOfType<T>[] {
	return useCrm().all(type);
}

/** One entity by vault path, or undefined if it isn't a CRM note of that type. */
export function useEntity<T extends EntityType>(path: string, type?: T): EntityOfType<T> | undefined {
	return useCrm().get(path, type);
}
