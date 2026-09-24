import { useId, useState, type SyntheticEvent } from 'react';
import { FIELDS, isEmptyValue, type FieldSpec, type FieldValue, type FieldValues } from '../../core/fields';
import type { EntityType } from '../../core/types';
import { FieldInput } from './FieldInput';

interface Props {
	type: EntityType;
	initial?: FieldValues;
	submitLabel: string;
	/** Adds a textarea whose content becomes the note body. */
	bodyLabel?: string;
	onSubmit: (values: FieldValues, body: string) => Promise<void>;
}

/** Returns an error message for the first invalid field, if any. */
export function validate(specs: FieldSpec[], values: FieldValues): string | null {
	for (const spec of specs) {
		const value = values[spec.key];
		if (spec.required && isEmptyValue(value)) return `${spec.label} is required.`;
		if (spec.kind === 'number' && !isEmptyValue(value)) {
			const n = Number(String(value).replace(/[\s,_]/g, ''));
			if (!Number.isFinite(n)) return `${spec.label} should be a number.`;
			if (spec.key === 'probability' && (n < 0 || n > 1)) return 'Probability should be between 0 and 1.';
		}
	}
	return null;
}

/** A form for all fields of an entity type, built from FIELDS. */
export function EntityForm({ type, initial = {}, submitLabel, bodyLabel, onSubmit }: Props) {
	const formId = useId();
	const specs = FIELDS[type];
	const [values, setValues] = useState<FieldValues>(initial);
	const [body, setBody] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const set = (key: string, value: FieldValue) => setValues((v) => ({ ...v, [key]: value }));

	const submit = async (e: SyntheticEvent) => {
		e.preventDefault();
		const problem = validate(specs, values);
		setError(problem);
		if (problem) return;
		setBusy(true);
		try {
			await onSubmit(values, body);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setBusy(false);
		}
	};

	return (
		<form className="abc-form" onSubmit={(e) => void submit(e)}>
			{specs.map((spec, i) => (
				<div key={spec.key} className="abc-form-row">
					<label htmlFor={`${formId}-${spec.key}`}>
						{spec.label}
						{spec.required && <span className="abc-required"> *</span>}
					</label>
					<FieldInput
						id={`${formId}-${spec.key}`}
						spec={spec}
						value={values[spec.key]}
						onChange={(v) => set(spec.key, v)}
						autoFocus={i === 0}
					/>
				</div>
			))}
			{bodyLabel && (
				<div className="abc-form-row abc-form-row-wide">
					<label htmlFor={`${formId}-body`}>{bodyLabel}</label>
					<textarea id={`${formId}-body`} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
				</div>
			)}
			{error && (
				<div className="abc-form-error" role="alert">
					{error}
				</div>
			)}
			<div className="modal-button-container">
				<button type="submit" className="mod-cta" disabled={busy}>
					{submitLabel}
				</button>
			</div>
		</form>
	);
}
