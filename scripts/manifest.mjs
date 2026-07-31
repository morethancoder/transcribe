// Emits the package.json that ships inside a dist archive. Node needs one with
// `"type": "module"` next to build/index.js to load the bundle as ESM; the rest
// is metadata so `npm start` works in an unpacked archive.
import { readFileSync } from 'node:fs';

const platform = process.argv[2] ?? 'any';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

process.stdout.write(
	JSON.stringify(
		{
			name: pkg.name,
			version: pkg.version,
			description: pkg.description,
			license: pkg.license,
			private: true,
			type: 'module',
			platform,
			engines: pkg.engines,
			scripts: { start: 'node build/index.js' }
		},
		null,
		'\t'
	) + '\n'
);
