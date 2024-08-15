import {resolve} from 'path';

import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte'
import {sveltePreprocess} from 'svelte-preprocess';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({mode}) => {
	const B_DEV = 'development' === mode;

	return {
		base: B_DEV? '/': '/websocket/',

		build: {
			outDir: resolve(__dirname, 'dist'),
			emptyOutDir: false,
			minify: !B_DEV,
			sourcemap: B_DEV? 'inline': false,
			target: ['esnext'],
			// rollupOptions: {
			// 	output: {
			// 		entryFileNames: `app${B_DEV? '.dev': ''}.js`,
			// 	},
			// },
		},

		plugins: [
			tsconfigPaths(),

			svelte({
				preprocess: sveltePreprocess(),
			}),
		],
	};
});
