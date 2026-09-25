import type { PhaseInput } from '../../core/fields';
import { formatDate } from '../../core/schema';

interface Props {
	value: PhaseInput[];
	onChange: (phases: PhaseInput[]) => void;
	/** Called when focus leaves the editor (not when moving between its cells). */
	onCommit?: () => void;
	id?: string;
}

/** Ordered project phases, each with a deadline and a done checkbox. */
export function PhasesEditor({ value, onChange, onCommit, id }: Props) {
	const today = formatDate(new Date());
	const update = (i: number, patch: Partial<PhaseInput>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
	const move = (i: number, dir: -1 | 1) => {
		const next = [...value];
		[next[i], next[i + dir]] = [next[i + dir]!, next[i]!];
		onChange(next);
	};

	return (
		<div
			className="abc-phases"
			id={id}
			onBlur={(e) => {
				if (onCommit && !e.currentTarget.contains(e.relatedTarget)) onCommit();
			}}
		>
			<ol>
				{value.map((phase, i) => {
					const overdue = phase.done !== 'true' && phase.deadline !== '' && phase.deadline < today;
					return (
						<li key={i} className={phase.done === 'true' ? 'is-done' : undefined}>
							<input
								type="checkbox"
								aria-label={`Phase ${i + 1} done`}
								checked={phase.done === 'true'}
								onChange={(e) => {
									const next = value.map((p, j) => (j === i ? { ...p, done: e.target.checked ? 'true' : '' } : p));
									onChange(next);
								}}
							/>
							<input
								type="text"
								aria-label={`Phase ${i + 1} name`}
								placeholder="Phase name"
								value={phase.name}
								onChange={(e) => update(i, { name: e.target.value })}
							/>
							<input
								type="date"
								aria-label={`Phase ${i + 1} deadline`}
								className={overdue ? 'abc-overdue' : undefined}
								value={phase.deadline}
								onChange={(e) => update(i, { deadline: e.target.value })}
							/>
							<div className="abc-phase-buttons">
								<button type="button" className="clickable-icon" aria-label={`Move phase ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
									↑
								</button>
								<button
									type="button"
									className="clickable-icon"
									aria-label={`Move phase ${i + 1} down`}
									disabled={i === value.length - 1}
									onClick={() => move(i, 1)}
								>
									↓
								</button>
								<button
									type="button"
									className="clickable-icon"
									aria-label={`Remove phase ${i + 1}`}
									onClick={() => onChange(value.filter((_, j) => j !== i))}
								>
									×
								</button>
							</div>
						</li>
					);
				})}
			</ol>
			<button type="button" onClick={() => onChange([...value, { name: '', deadline: '', done: '' }])}>
				Add phase
			</button>
		</div>
	);
}
