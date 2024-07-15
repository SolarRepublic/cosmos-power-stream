import {resolve} from 'path';

import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte'
import {sveltePreprocess} from 'svelte-preprocess';

export default defineConfig(({mode}) => {
	const B_DEV = 'development' === mode;

	return {
		build: {
			outDir: resolve(__dirname, '../dist'),
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
			svelte({
				preprocess: sveltePreprocess(),
			}),
		],
	};
});
