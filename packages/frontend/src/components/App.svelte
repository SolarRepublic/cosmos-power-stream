<script lang="ts">
	import type {LiveSubscription} from '../types';
	import type {JsonRpc, JsonRpcClient} from '../../../shared/src/json-rpc';
	import type {ServiceVocab} from '../../../shared/src/vocab';
	
	import {entries, stringify_json, try_async} from '@blake.regalia/belt';
	import {onMount} from 'svelte';

	import {open_ws_rpc} from '../rpc-client';

	import Editor from './Editor.svelte';
	import Subscription from './Subscription.svelte';


	let sx_mascot_filter = '';
	let i_filter = 0;
	let a_filters = [
		'saturate(1) hue-rotate(204deg) invert(0)',
		'saturate(1) hue-rotate(184deg) invert(0)',
		'saturate(1.1) hue-rotate(0deg) invert(0)',
		'saturate(1.5) hue-rotate(169deg) invert(1)',
		'saturate(1) hue-rotate(60deg) invert(1)',
	];
	function change_filter() {
		i_filter = (++i_filter) % a_filters.length;
	}

	let s_app_version = '';
	let si_chain = '';
	let k_rpc: JsonRpc<JsonRpcClient, ServiceVocab>;

	let h_subscriptions: Dict<LiveSubscription> = {};

	onMount(async() => {
		k_rpc = await open_ws_rpc();

		const g_info = await k_rpc.call('power_stream_info', {});

		s_app_version = g_info.version;
		si_chain = g_info.node.network;

		document.title += `: ${si_chain}`;
	});

	async function submit_query(d_event: CustomEvent<string>) {
		// query string
		const s_query = d_event.detail;

		// try parsing
		let [g_ast, e_parse] = await try_async(() => k_rpc.call('parse_query', {query:s_query}));

		// invalid query
		if(e_parse) {
			console.error(e_parse);
		}
		// valid query
		else {
			// canonicalize
			const s_canonical = stringify_json(g_ast);

			// already subscribed
			if(h_subscriptions[s_canonical]) {

			}
			// not yet subscribed
			else {
				// update subscriptions
				h_subscriptions[s_canonical] = {
					query: d_event.detail,
					chainId: si_chain,
				};
	
				// invalidate
				h_subscriptions = h_subscriptions;
			}
		}
	}

	// async function search_txs(d_event: CustomEvent<string>) {


	// 	const g_search = await k_rpc.call('search_txs', {
	// 		query: d_event.detail,
	// 	}, (g_stream) => {
	// 		debugger;
	// 	});

	// 	console.log(g_search);
	// }
</script>

<style lang="less">
	header {
		margin-bottom: 12px;
	}

	.header {
		display: flex;
		gap: 6px;

		h1 {
			.mascot {
				display: inline-block;
				height: 30px;
				width: 45px;
				transition: filter 1s linear;
			}
			img {
				position: absolute;
				margin-left: -6px;
				margin-top: 3px;
			}
		}

		.info {
			display: flex;
			flex-direction: column;
			justify-content: center;
			font-size: 11px;
		}
	}

	.subheader {
		margin-left: 90px;
	}

	h1 {
		margin: 0 8px;
		font-size: 26px;
	}
</style>


<header>
	<div class="header">
		<div>
			<h1>
				<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
				<span class="mascot" style:filter={a_filters[i_filter]} on:click={change_filter}>
					<img src="../public/mascot.png" alt="Mascot" height="64">
				</span>
				<span>
					Cosmos Power Stream
				</span>
			</h1>
		</div>

		<div class="info">
			<div>
				<span>
					v{s_app_version}
				</span>
				<span>
					by Blake Regalia
				</span>
			</div>

			<div>
				SolarRepublic/cosmos-power-stream
			</div>
		</div>
	</div>

	<div class="subheader">
		<div>
			Chain ID: {si_chain}
		</div>
	</div>
</header>

{#if k_rpc}
	<main>
		<Editor {k_rpc} on:submit={submit_query} />

		{#each entries(h_subscriptions) as [s_canonical, g_subscription] (s_canonical)}
			<Subscription {k_rpc} {g_subscription} />
		{/each}
	</main>
{:else}
	<h1>Connecting...</h1>
{/if}