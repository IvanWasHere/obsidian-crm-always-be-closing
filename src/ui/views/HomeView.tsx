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
		<div className="vault-crm-home">
			<h2>Hello, CRM</h2>
			<div className="vault-crm-stats">
				{(Object.keys(LABELS) as EntityType[]).map((type) => (
					<div key={type} className="vault-crm-stat" data-testid={`stat-${type}`}>
						<div className="vault-crm-stat-value">{crm.count(type)}</div>
						<div className="vault-crm-stat-label">{LABELS[type]}</div>
					</div>
				))}
			</div>
		</div>
	);
}
