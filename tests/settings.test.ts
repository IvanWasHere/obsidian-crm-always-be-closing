import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, parseStages } from '../src/settings';

describe('settings', () => {
	it('fills in defaults, including nested folders', () => {
		const s = mergeSettings({ folders: { contacts: 'People' }, pipelineStages: [] });
		expect(s.folders).toEqual({ ...DEFAULT_SETTINGS.folders, contacts: 'People' });
		expect(s.pipelineStages).toEqual(DEFAULT_SETTINGS.pipelineStages);
		expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('does not share the default stages array', () => {
		mergeSettings(undefined).pipelineStages.push('x');
		expect(DEFAULT_SETTINGS.pipelineStages).not.toContain('x');
	});

	it('parses comma-separated stages', () => {
		expect(parseStages(' lead, won ,, lead,lost')).toEqual(['lead', 'won', 'lost']);
	});
});
