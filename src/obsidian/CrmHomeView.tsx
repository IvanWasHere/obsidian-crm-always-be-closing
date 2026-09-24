import { ReactItemView } from './ReactItemView';
import { HomeView } from '../ui/views/HomeView';

export const VIEW_TYPE_CRM_HOME = 'vault-crm-home';

export class CrmHomeView extends ReactItemView {
	getViewType() {
		return VIEW_TYPE_CRM_HOME;
	}

	getDisplayText() {
		return 'CRM';
	}

	getIcon() {
		return 'contact';
	}

	protected renderView() {
		return <HomeView />;
	}
}
