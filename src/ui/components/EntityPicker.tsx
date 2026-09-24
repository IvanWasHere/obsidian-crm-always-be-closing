import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { basename } from '../../core/schema';
import type { EntityType } from '../../core/types';
import { fuzzyFilter } from '../../utils/fuzzy';
import { useCrm } from '../hooks/useCrm';

interface Props {
	type: EntityType;
	/** Selected vault paths. */
	value: string[];
	onChange: (paths: string[]) => void;
	multiple?: boolean;
	placeholder?: string;
	id?: string;
	autoFocus?: boolean;
}

const MAX_SUGGESTIONS = 8;

/** Picks one or more CRM notes of a type with fuzzy search. */
export function EntityPicker({ type, value, onChange, multiple = false, placeholder, id, autoFocus }: Props) {
	const crm = useCrm();
	const listId = useId();
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);

	const suggestions = useMemo(
		() =>
			fuzzyFilter(
				query,
				crm.all(type).filter((e) => !value.includes(e.path)),
				(e) => e.name,
				MAX_SUGGESTIONS,
			),
		[crm, type, value, query],
	);

	const select = (path: string) => {
		onChange(multiple ? [...value, path] : [path]);
		setQuery('');
		setActive(0);
		if (!multiple) setOpen(false);
	};

	const remove = (path: string) => onChange(value.filter((p) => p !== path));

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			setOpen(true);
			const step = e.key === 'ArrowDown' ? 1 : -1;
			setActive((i) => (suggestions.length ? (i + step + suggestions.length) % suggestions.length : 0));
		} else if (e.key === 'Enter' && open && suggestions[active]) {
			// Pick the suggestion instead of submitting the form.
			e.preventDefault();
			select(suggestions[active].path);
		} else if (e.key === 'Escape' && open) {
			// Close the list without closing the modal.
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
		} else if (e.key === 'Backspace' && query === '' && value.length > 0) {
			remove(value[value.length - 1]!);
		}
	};

	const showInput = multiple || value.length === 0;

	return (
		<div className="abc-picker">
			{value.map((path) => (
				<span key={path} className="abc-chip">
					{crm.get(path)?.name ?? basename(path)}
					<button
						type="button"
						className="abc-chip-remove clickable-icon"
						aria-label={`Remove ${crm.get(path)?.name ?? basename(path)}`}
						onClick={() => remove(path)}
					>
						×
					</button>
				</span>
			))}
			{showInput && (
				<input
					id={id}
					type="text"
					role="combobox"
					aria-expanded={open}
					aria-controls={listId}
					aria-autocomplete="list"
					autoFocus={autoFocus}
					placeholder={placeholder}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActive(0);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => setOpen(false)}
					onKeyDown={onKeyDown}
				/>
			)}
			{open && showInput && (
				<ul id={listId} role="listbox" className="abc-picker-list">
					{suggestions.length === 0 && <li className="abc-picker-empty">No matches</li>}
					{suggestions.map((e, i) => (
						<li
							key={e.path}
							role="option"
							aria-selected={i === active}
							className={i === active ? 'is-active' : undefined}
							// mousedown fires before the input's blur closes the list
							onMouseDown={(ev) => {
								ev.preventDefault();
								select(e.path);
							}}
							onMouseEnter={() => setActive(i)}
						>
							{e.name}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
