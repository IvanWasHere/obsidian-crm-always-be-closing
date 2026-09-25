import type { FieldSpec, FieldValue, LineItemInput, PhaseInput } from '../../core/fields';
import { PhasesEditor } from './PhasesEditor';
import { AssetsEditor } from './AssetsEditor';
import { LineItemsEditor } from './LineItemsEditor';
import { EntityPicker } from './EntityPicker';
import { useSettings } from '../hooks/useSettings';

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
	time: 'time',
};

/** The input control for one field, chosen by its kind. */
export function FieldInput({ spec, value, onChange, onCommit, id, autoFocus }: Props) {
	const settings = useSettings();

	if (spec.kind === 'items') {
		return (
			<LineItemsEditor
				id={id}
				value={Array.isArray(value) ? (value as LineItemInput[]) : []}
				onChange={onChange}
				onCommit={onCommit}
			/>
		);
	}

	if (spec.kind === 'phases') {
		return (
			<PhasesEditor
				id={id}
				value={Array.isArray(value) ? (value as PhaseInput[]) : []}
				onChange={onChange}
				onCommit={onCommit}
			/>
		);
	}

	if (spec.kind === 'assets') {
		return <AssetsEditor id={id} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
	}

	if (spec.kind === 'link' || spec.kind === 'links') {
		return (
			<EntityPicker
				id={id}
				type={spec.target!}
				multiple={spec.kind === 'links'}
				value={Array.isArray(value) ? (value as string[]) : []}
				onChange={onChange}
				placeholder={spec.kind === 'links' ? 'Add…' : 'Search…'}
				autoFocus={autoFocus}
			/>
		);
	}

	// Links and line items were handled above; what's left is text (tags may arrive as a list).
	const text = Array.isArray(value)
		? value.filter((v): v is string => typeof v === 'string').join(', ')
		: (value ?? '');

	if (spec.kind === 'multiline') {
		return (
			<textarea
				id={id}
				rows={3}
				placeholder={spec.placeholder}
				autoFocus={autoFocus}
				value={text}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onCommit}
			/>
		);
	}

	if (spec.kind === 'checkbox') {
		return (
			<input
				id={id}
				type="checkbox"
				className="abc-checkbox"
				checked={text === 'true'}
				onChange={(e) => onChange(e.target.checked ? 'true' : '')}
				autoFocus={autoFocus}
			/>
		);
	}

	if (spec.kind === 'select') {
		const options = spec.options?.(settings) ?? [];
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
