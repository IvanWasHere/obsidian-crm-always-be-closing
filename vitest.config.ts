import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
	plugins: [
		{
			// Match esbuild's base64 loader for fonts.
			name: 'ttf-base64',
			// Run before Vite's asset plugin, which would otherwise turn fonts into URLs.
			enforce: 'pre',
			load(id) {
				if (id.endsWith('.ttf')) return `export default ${JSON.stringify(readFileSync(id).toString('base64'))};`;
			},
		},
	],
	resolve: {
		alias: {
			// The real `obsidian` package only ships type definitions.
			obsidian: fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)),
		},
	},
	esbuild: { jsx: 'automatic' },
	test: {
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		include: ['tests/**/*.test.{ts,tsx}'],
	},
});
