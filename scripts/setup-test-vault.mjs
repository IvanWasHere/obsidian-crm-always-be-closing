// Downloads the Hot-Reload plugin (https://github.com/pjeby/hot-reload) into
// the test vault so plugin rebuilds from `npm run dev` reload automatically.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'test-vault/.obsidian/plugins/hot-reload';
const base = 'https://raw.githubusercontent.com/pjeby/hot-reload/master';

mkdirSync(dir, { recursive: true });
for (const file of ['main.js', 'manifest.json']) {
	const res = await fetch(`${base}/${file}`);
	if (!res.ok) throw new Error(`Failed to download ${file}: ${res.status}`);
	writeFileSync(join(dir, file), await res.text());
}
console.log(`Hot-Reload installed in ${dir}`);
