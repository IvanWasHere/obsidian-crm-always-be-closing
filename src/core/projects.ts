import type { CrmSnapshot } from './CrmSnapshot';
import { PRIORITIES, type DateString, type Phase, type Project, type Requirement } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Reads `phases` from frontmatter: a list of `{ name, deadline?, done? }`.
 * A bare string is a phase name. Returns the phases and how many were unreadable.
 */
export function parsePhases(value: unknown): { phases: Phase[]; invalid: number } {
	if (!Array.isArray(value)) return { phases: [], invalid: value === undefined || value === null ? 0 : 1 };
	const phases: Phase[] = [];
	let invalid = 0;
	for (const raw of value) {
		if (typeof raw === 'string' && raw.trim()) {
			phases.push({ name: raw.trim(), done: false });
			continue;
		}
		const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
		const name = typeof r?.name === 'string' ? r.name.trim() : '';
		if (!r || !name) {
			invalid++;
			continue;
		}
		const deadline =
			r.deadline instanceof Date
				? r.deadline.toISOString().slice(0, 10)
				: typeof r.deadline === 'string' && DATE.test(r.deadline)
					? r.deadline.slice(0, 10)
					: undefined;
		phases.push({ name, done: r.done === true || r.done === 'true', ...(deadline ? { deadline } : {}) });
	}
	return { phases, invalid };
}

/** The first phase not yet done, if any. */
export function currentPhase(project: Project): Phase | undefined {
	return project.phases.find((p) => !p.done);
}

export const isOpenRequirement = (r: Requirement) => r.status === 'open' || r.status === 'in-progress';

/** Open first, then by priority (high → low → none), deadline (soonest first) and name. */
export function sortRequirements(list: readonly Requirement[]): Requirement[] {
	const rank = (r: Requirement) => (isOpenRequirement(r) ? 0 : r.status === 'done' ? 1 : 2);
	const prio = (r: Requirement) => (r.priority ? PRIORITIES.indexOf(r.priority) : PRIORITIES.length);
	return [...list].sort(
		(a, b) =>
			rank(a) - rank(b) ||
			prio(a) - prio(b) ||
			(a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
			a.name.localeCompare(b.name),
	);
}

/** Done ÷ total requirements, ignoring dropped ones. */
export function requirementProgress(list: readonly Requirement[]): { done: number; total: number } {
	const counted = list.filter((r) => r.status !== 'dropped');
	return { done: counted.filter((r) => r.status === 'done').length, total: counted.length };
}

export interface ProjectDeadline {
	date: DateString;
	label: string;
	/** Note to open: the project, or the requirement. */
	path: string;
}

/**
 * Everything still due on a project: its overall deadline, unfinished
 * phases and open requirements. Sorted soonest first.
 */
export function projectDeadlines(project: Project, crm: CrmSnapshot): ProjectDeadline[] {
	const items: ProjectDeadline[] = [];
	if (project.deadline) items.push({ date: project.deadline, label: 'Project deadline', path: project.path });
	for (const phase of project.phases) {
		if (!phase.done && phase.deadline) items.push({ date: phase.deadline, label: `Phase: ${phase.name}`, path: project.path });
	}
	for (const r of crm.requirementsOf(project.path)) {
		if (isOpenRequirement(r) && r.deadline) items.push({ date: r.deadline, label: r.name, path: r.path });
	}
	return items.sort((a, b) => a.date.localeCompare(b.date));
}
