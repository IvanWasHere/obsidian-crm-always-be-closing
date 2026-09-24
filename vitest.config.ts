import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
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
