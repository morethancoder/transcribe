import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * One codebase, two products.
 *
 * The **server** build (default) is adapter-node: transcrape as a local web
 * server that shells out to ffmpeg and whisper-cli, so it needs a real
 * filesystem and child processes. Output goes to `build/`.
 *
 * The **app** build (`TRANSCRAPE_TARGET=app`, set by the `build:app` script
 * that Tauri runs) is adapter-static: Tauri serves the frontend as plain files
 * from its own webview and there is no Node runtime behind it — on iOS there
 * cannot be, since the sandbox forbids spawning processes at all. The engine
 * lives in Rust instead (src-tauri), reached over Tauri's IPC rather than
 * `fetch`, so `src/routes/api/*` is dead code in this build and dropped.
 *
 * SPA fallback rather than prerendering: `/history/[id]` is keyed by a
 * localStorage id that only exists on the device, so there is no set of pages
 * to render ahead of time.
 */
/**
 * Tauri injects TAURI_ENV_* into whatever it runs as its before*Command, so the
 * app build detects itself and `beforeBuildCommand` stays a plain `pnpm build`
 * — no `VAR=value` prefix, which cmd.exe wouldn't understand anyway. The
 * explicit variable is the escape hatch for building the frontend on its own.
 */
const app =
	process.env.TRANSCRAPE_TARGET === 'app' || process.env.TAURI_ENV_PLATFORM !== undefined;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: app
				? adapterStatic({
						pages: 'build-app',
						assets: 'build-app',
						fallback: 'index.html',
						precompress: false,
						strict: false
					})
				: adapterNode({ out: 'build' })
		})
	],

	// Tauri drives vite itself in `tauri dev`; fail loudly instead of silently
	// hopping to another port, which would leave the webview pointed at nothing.
	server: { strictPort: true },

	// Rust owns the app engine, so its build output should never trip vite's
	// watcher into a rebuild loop.
	...(app ? { envPrefix: ['VITE_', 'TAURI_ENV_'] } : {})
});
