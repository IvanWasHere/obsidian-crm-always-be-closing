import type { DateString, InteractionKind } from './types';

const KIND_TITLES: Record<InteractionKind, string> = {
	call: 'Call with',
	email: 'Email with',
	meeting: 'Meeting with',
	message: 'Message with',
	note: 'Note on',
};

/** e.g. `2026-09-20 Call with Jane Doe`, `2026-09-20 Meeting with Jane Doe +2`. */
export function interactionTitle(kind: InteractionKind, date: DateString, contactNames: string[]): string {
	const [first, ...rest] = contactNames;
	if (!first) return `${date} ${KIND_TITLES[kind].split(' ')[0]!}`;
	const who = rest.length === 0 ? first : rest.length === 1 ? `${first} and ${rest[0]!}` : `${first} +${rest.length}`;
	return `${date} ${KIND_TITLES[kind]} ${who}`;
}

/** Removes characters that are not allowed in file names or break links. */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '');
}
