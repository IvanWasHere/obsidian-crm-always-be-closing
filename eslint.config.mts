import obsidianmd from 'eslint-plugin-obsidianmd';
import reactHooks from 'eslint-plugin-react-hooks';
import { DEFAULT_ACRONYMS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'test-vault',
		'scripts',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'vitest.config.ts',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			'obsidianmd/ui/sentence-case': [
				'warn',
				{ enforceCamelCaseLower: true, acronyms: [...DEFAULT_ACRONYMS, 'CRM', 'PDF'] },
			],
		},
	},
	{
		files: ['src/**/*.{ts,tsx}'],
		...reactHooks.configs.flat.recommended,
	},
);
