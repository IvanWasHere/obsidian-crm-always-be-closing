import type { ReactNode } from 'react';
import { useOpenNote } from '../hooks/useObsidian';

/**
 * A link to a vault note, styled like Obsidian's internal links.
 * A real `href` keeps it focusable and keyboard-activatable.
 */
export function NoteLink({ path, children }: { path: string; children: ReactNode }) {
	const openNote = useOpenNote();
	return (
		<a
			className="internal-link"
			href={path}
			data-href={path}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				openNote(path, e);
			}}
		>
			{children}
		</a>
	);
}
