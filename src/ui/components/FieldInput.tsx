import type { FieldSpec, FieldValue } from '../../core/fields';
import { EntityPicker } from './EntityPicker';
import { usePlugin } from '../hooks/usePlugin';

interface Props {
	spec: FieldSpec;
	value: FieldValue | undefined;
	onChange: (value: FieldValue) => void;
	/** Called when a text-like input loses focus or Enter is pressed. */
	onCommit?: () => void;
	id?: string;
	autoFocus?: boolean;
}

const INPUT_TYPES: Partial<Record<FieldSpec['kind'], string>> = {
	email: 'email',
	tel: 'tel',
	url: 'url',
	date: 'date',
};

/** The input control for one field, chosen by its kind. */
export function FieldInput({ spec, value, onChange, onCommit, id, autoFocus }: Props) {
	const { plugin } = usePlugin();

	if (spec.kind === 'link' || spec.kind === 'links') {
		return (
			<EntityPicker
				id={id}
				type={spec.target!}
				multiple={spec.kind === 'links'}
				value={Array.isArray(value) ? value : []}
				onChange={onChange}
				placeholder={spec.kind === 'links' ? 'Add…' : 'Search…'}
				autoFocus={autoFocus}
			/>
		);
	}

	const text = Array.isArray(value) ? value.join(', ') : (value ?? '');

	if (spec.kind === 'select') {
		const options = spec.options?.(plugin.settings) ?? [];
		return (
			<select id={id} className="dropdown" value={text} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}>
				{!spec.required && <option value="">—</option>}
				{/* Keep an unknown current value visible instead of silently switching it. */}
				{text && !options.includes(text) && <option value={text}>{text}</option>}
				{options.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</select>
		);
	}

	return (
		<input
			id={id}
			type={INPUT_TYPES[spec.kind] ?? 'text'}
			inputMode={spec.kind === 'number' ? 'decimal' : undefined}
			placeholder={spec.placeholder}
			autoFocus={autoFocus}
			value={text}
			onChange={(e) => onChange(e.target.value)}
			onBlur={onCommit}
			onKeyDown={(e) => {
				if (e.key === 'Enter' && onCommit) {
					e.preventDefault();
					onCommit();
				}
			}}
		/>
	);
}
