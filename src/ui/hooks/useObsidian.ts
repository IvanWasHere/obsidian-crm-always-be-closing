import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Keymap } from 'obsidian';
import { usePlugin } from './usePlugin';

/**
 * Opens a note. Pass the triggering event so Cmd/Ctrl-click opens a new tab,
 * or `'tab'` to always open one.
 */
export function useOpenNote() {
	const { app } = usePlugin();
	return useCallback(
		(path: string, how?: MouseEvent | KeyboardEvent | 'tab') => {
			const newLeaf = how === undefined ? false : how === 'tab' ? 'tab' : Keymap.isModEvent(how.nativeEvent);
			void app.workspace.openLinkText(path, '', newLeaf);
		},
		[app],
	);
}

/** Path of the note in the active (or most recently active) editor. */
export function useActiveFilePath(): string | null {
	const { app } = usePlugin();
	const [path, setPath] = useState(() => app.workspace.getActiveFile()?.path ?? null);

	useEffect(() => {
		const update = () => setPath(app.workspace.getActiveFile()?.path ?? null);
		const refs = [app.workspace.on('file-open', update), app.workspace.on('active-leaf-change', update)];
		update();
		return () => refs.forEach((ref) => app.workspace.offref(ref));
	}, [app]);

	return path;
}
