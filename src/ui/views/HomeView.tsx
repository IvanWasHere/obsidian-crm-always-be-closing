import type { EntityType } from '../../core/types';
import { useCrm } from '../hooks/useCrm';

const LABELS: Record<EntityType, string> = {
	contact: 'Contacts',
	company: 'Companies',
	deal: 'Deals',
	interaction: 'Interactions',
};

export function HomeView() {
	const crm = useCrm();

	return (
		<div className="abc-home">
			<h2>Hello, CRM</h2>
			<div className="abc-stats">
				{(Object.keys(LABELS) as EntityType[]).map((type) => (
					<div key={type} className="abc-stat" data-testid={`stat-${type}`}>
						<div className="abc-stat-value">{crm.count(type)}</div>
						<div className="abc-stat-label">{LABELS[type]}</div>
					</div>
				))}
			</div>
		</div>
	);
}
