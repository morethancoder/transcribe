import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node, not adapter-auto: transcrape is a local server that shells
			// out to ffmpeg and whisper-cli, so it can only ever run on a machine with
			// a real filesystem and child processes. The output is plain portable
			// JavaScript — scripts/build.sh wraps it per platform.
			adapter: adapter({ out: 'build' })
		})
	]
});
