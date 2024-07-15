<script lang="ts">
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import type {JsonRpc, JsonRpcClient} from '../../../shared/src/json-rpc';

	import {sha256} from '@noble/hashes/sha256';
	import {createEventDispatcher, onDestroy, onMount} from 'svelte';
	import {text_to_bytes, bytes_to_base64} from '@blake.regalia/belt';
	import {register_powerstreamql, SI_POWERSTREAMQL_LANGUAGE, SI_POWERSTREAMQL_THEME} from '../powerstreamql';
	import monaco from '../monaco';

	export let k_rpc: JsonRpc<JsonRpcClient>;

	let y_editor: Monaco.editor.IStandaloneCodeEditor;
	let y_monaco: typeof Monaco;
	let dm_editor: HTMLElement;

	const dispatch = createEventDispatcher<{
		submit: string;
	}>();

	type Tab = {
		label: string;
		model: Monaco.editor.ITextModel;
		hash: string;
	};

	// const S_DEFAULT_EXAMPLE = `tm.event='Tx' AND tx.height >= 10000uscrt || (sender.address != "yellow") && thing like "gray%"`;
	const S_DEFAULT_EXAMPLE = `transfer.amount <= 5800uscrt`;

	let a_tabs: Tab[] = [];
	let g_tab_selected: Tab | null = null;

	function ins_tab(s_init: string, b_set=false): Tab {
		const y_model = y_monaco.editor.createModel(
			s_init,
			SI_POWERSTREAMQL_LANGUAGE
		);

		if(b_set || !a_tabs.length) y_editor.setModel(y_model);

		const g_tab = g_tab_selected = {
			label: `Query #${crypto.randomUUID().slice(0, 4)}`,
			model: y_model,
			get hash(): string {
				return bytes_to_base64(sha256(text_to_bytes(y_model.getValue())));
			},
		};

		a_tabs = [...a_tabs, g_tab];

		return g_tab;
	}

	function sel_tab(g_tab: Tab) {
		y_editor.setModel(g_tab.model);
		g_tab_selected = g_tab;
	}

	onMount(async () => {
		y_monaco = (await import('../monaco')).default;

		register_powerstreamql(y_monaco);

		y_monaco.editor.setTheme(SI_POWERSTREAMQL_THEME);

		y_editor = y_monaco.editor.create(dm_editor, {
			acceptSuggestionOnEnter: 'on',
			autoIndent: 'full',
			wrappingIndent: 'indent',
			wordWrap: 'on',
			minimap: {
				enabled: false,
			},
			renderWhitespace: 'boundary',
			tabCompletion: 'on',
			padding: {
				top: 8,
			},
		});

		y_editor.addAction({
			id: 'search',
			label: 'Search and Subscribe',
			keybindings: [y_monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
			run() {
				const s_query = g_tab_selected?.model.getValue();
				if(s_query) dispatch('submit', s_query);
			},
		});

		ins_tab(S_DEFAULT_EXAMPLE, true);
	});

	onDestroy(() => {
		y_monaco?.editor.getModels().forEach((y_model) => y_model.dispose());
		y_editor?.dispose();
	});
</script>

<style lang="less">
	.container {
		width: 100%;
		max-width: 800px;
		height: 80px;
		// resize: both;
		// overflow: hidden;
	}

	.tabs {
		display: flex;
		margin: 0;
		padding: 0;

		>li {
			margin: 0;
			padding: 0;

			a {
				display: flex;
				border: 1px solid black;
				background: rgba(102, 102, 102, 0.3);
				padding: 6px 16px;

				color: #f9f9f960;
				text-decoration: none;
				font-size: 12px;

				&[aria-selected="true"] {
					background: #333;
					color: #f9f9f9;
				}
			}
		}
	}
</style>

<div>
	<div class="tabs">
		<ul role="tablist" class="tabs">
			{#each a_tabs as g_tab}
				<li role="presentation">
					<a href="#tab1" role="tab" aria-selected={g_tab === g_tab_selected? 'true': 'false'}
						on:click={() => sel_tab(g_tab)}
					>
						{g_tab.label}
					</a>
				</li>
			{/each}

			<li role="presentation">
				<a href="#tab1" role="tab" aria-selected="false"
					on:click={() => ins_tab('', true)}
				>
					+ New query
				</a>
			</li>
		</ul>
	</div>

	<div class="container" bind:this={dm_editor} />
</div>
