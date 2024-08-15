<script lang="ts">
	import type {WeakUintStr} from '@solar-republic/types';
	import type {JsonRpc, JsonRpcClient, JsonRpcError} from '#shared/json-rpc';
	import type {ServiceVocab} from '#shared/vocab';
	import type {AstNode} from '#shared/event-query';
	import type {LiveSubscription} from '../types';

	import {try_async, deduplicate, try_sync} from '@blake.regalia/belt';
	import {createEventDispatcher, onMount} from 'svelte';

	import {walk} from '../../shared/src/event-query';
	import {block_explorer_tx} from '../util';

	export let k_rpc: JsonRpc<JsonRpcClient, ServiceVocab>;
	export let g_subscription: LiveSubscription;

	let a_txs: {
		hash: string;
		height: WeakUintStr;
		events: Dict<string[]>;
	}[] = [];

	let b_reverse_order = true;
	let b_stopped = false;

	let g_subscribe: ServiceVocab['subscribe']['returns'] | undefined;
	let z_error: JsonRpcError | Error | 0;
	let as_paths = new Set<string>();

	const dispatch = createEventDispatcher<{
		close: null;
	}>();

	onMount(async() => {
		// // call subscribe method
		// [g_subscribe, z_error] = await try_async(() => k_rpc.call('subscribe', {
		// 	query: g_subscription.query,
		// }, (g_msg) => {
		// 	const sg_height = g_msg.data.value.TxResult.height!;

		// 	const g_tx = {
		// 		hash: g_msg.events['tx.hash']![0],
		// 		height: sg_height,
		// 		events: g_msg.events,
		// 	};

		// 	if(b_reverse_order) {
		// 		a_txs.unshift(g_tx);
		// 	}
		// 	else {
		// 		a_txs.push(g_tx);
		// 	}

		// 	// reactive update
		// 	a_txs = a_txs;
		// }));

		// call subscribe method
		[g_subscribe, z_error] = await try_async(() => k_rpc.call('search_txs', {
			query: g_subscription.query,
		}, (g_msg) => {
			const {
				batch: a_batch,
			} = g_msg;

			if(a_batch) {
				for(const g_row of a_batch) {
					const {
						data: {
							value: {
								TxResult: {
									height: sg_height,
									result: g_result,
								},
							},
						},
						events: h_events,
					} = g_row;

					// skip non-results
					if(!h_events) continue;

					// add to list
					a_txs.push({
						height: sg_height!,
						hash: h_events['tx.hash']![0],
						events: h_events,
					});
				}
			}

			// const sg_height = g_msg.data.value.TxResult.height!;

			// const g_tx = {
			// 	hash: g_msg.events['tx.hash']![0],
			// 	height: sg_height,
			// 	events: g_msg.events,
			// };

			// if(b_reverse_order) {
			// 	a_txs.unshift(g_tx);
			// }
			// else {
			// 	a_txs.push(g_tx);
			// }

			// reactive update
			a_txs = a_txs;
		}));


		// success
		if(!z_error) {
			// ref AST
			const g_ast = g_subscribe!.ast as AstNode;

			// canonicalize
			g_subscription.canonical = JSON.stringify(g_ast);

			// extract paths
			walk(g_ast, {
				and(g) {
					this.eval(g.lhs);
					this.eval(g.rhs);
				},
				or(g) {
					this.eval(g.lhs);
					this.eval(g.rhs);
				},
				expr(g) {
					as_paths.add(g.key);
				},
			});

			// ignore event type, hash and height
			as_paths.delete('tm.event');
			as_paths.delete('tx.hash');
			as_paths.delete('tx.height');
		}

		// now subscribe
		await try_async(() => k_rpc.call('subscribe', {
			query: g_subscription.query,
		}, (g_data) => {
			const {
				data: {
					value: {
						TxResult: {
							height: sg_height,
							result: g_result,
						},
					},
				},
				events: h_events,
			} = g_data;

			// skip non-results
			if(!h_events) return;

			// add to list
			a_txs.push({
				height: sg_height!,
				hash: h_events['tx.hash']![0],
				events: h_events,
			});

			// reactive update
			a_txs = a_txs;
		}));
	});

	async function unsubscribe() {
		b_stopped = true;

		// unsubscribe
		await try_async(() => k_rpc.call('unsubscribe', {
			query: g_subscription.query,
		}));
	}

	function reverse_order() {
		b_reverse_order = !b_reverse_order;

		a_txs = a_txs.reverse();
	}

	async function close() {
		await unsubscribe();

		dispatch('close', null);
	}

</script>

<style lang="less">
	section {
		color: #004;
		background: rgba(210, 210, 255, 0.7);
		border-radius: 4px;
		margin: 6px 0;
	}

	.header {
		display: flex;
		margin: 4px;
		font-size: 12px;

		&>* {
			display: inline-block;
			margin: 4px;

			display: inline-flex;
			gap: 0;
		}

		button {
			border: 1px solid #555;
			display: inline-flex;
			gap: 4px;
			align-items: center;
			justify-content: center;
			background-color: rgba(0,0,0,0.1);
			color: #212121;

			&:nth-child(n+1) {
				margin-left: -1px;
			}
		}
	}
	
	table {
		margin-left: 4px;
		font-size: 10px;
		text-align: left;
		border-collapse: collapse;

		thead th {
			position: sticky;
			top: 0;
			z-index: 1;
			background: rgba(210, 210, 255, 0.7);
		}
	}

	td {
		border-top: 1px solid #777;
		padding: 4px 2px;

		&:first-child {
			border-left: 1px solid #777;
			padding-left: 4px;
		}

		&:last-child {
			border-right: 1px solid #777;
			padding-right: 4px;
		}
	}

	td.hash {
		max-width: 9ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	ul.list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style-type: none;
	}

	.value {
		max-height: 90px;
		max-width: 300px;
		overflow: scroll;
	}

	.meta {
		color: #666;

		&.empty {
			font-style: italic;
		}
	}

	.tagged-group {
		display: flex;
		gap: 6px;
	}

	.tagged-value {
		display: inline-block;
		padding: 6px 6px 6px 0;
		background-color: rgba(240,240,240,0.2);
		border: 1px solid rgba(0,0,0,0.2);

		.tag-label {
			background-color: rgba(0,0,120,0.6);
			color: #d8d8d8;
			padding: 6px;
		}

		.tag-value {

		}
	}
</style>

<section>
	{#if z_error}
		Error: {z_error.message}
	{:else if g_subscribe}
		<div class="header">
			<span class="controls">
				{#if b_stopped}
					<button>
						<img src="/icon/restart.svg" alt="Restart">
						Restart
					</button>
				{:else}
					<button on:click={unsubscribe}>
						<img src="/icon/stop.svg" alt="Stop">
						Stop
					</button>
				{/if}

				<button on:click={close}>
					<img src="/icon/cancel.svg" alt="Close">
					Close
				</button>

				<button on:click={reverse_order}>
					<img src="/icon/swap.svg" alt="Reverse order">
					{b_reverse_order? 'Newest': 'Oldest'}
				</button>
			</span>

			<span class="tagged-group">
				<span class="tagged-value">
					<span class="tag-label">
						Query:
					</span>
					<span class="tag-value">
						<code>{g_subscription.query.replace(/\n+/g, ' ')}</code>
					</span>
				</span>

				<span class="tagged-value">
					<span class="tag-label">
						Matches:
					</span>
					<span class="tag-value">
						<code>{a_txs.length}</code>
					</span>
				</span>
			</span>
		</div>

		{#if a_txs.length}
			<table>
				<thead>
					<tr>
						<th>tx.height</th>
						<th>tx.hash</th>
						{#each as_paths as s_path}
							<th>{s_path}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each a_txs.slice().reverse() as g_tx (g_tx.hash)}
						<tr>
							<td>
								{g_tx.height}
							</td>
							<td class="hash">
								<a target="_blank"
									href={block_explorer_tx({
										chainShort: g_subscription.chainId.replace(/^([^-]+).*$/, '$1'),
										hash: g_tx.hash,
									})}
								>
									{g_tx.hash}
								</a>
							</td>
							{#each as_paths as s_path}
								{@const a_values = deduplicate(g_tx.events[s_path] ?? [])}
								<td>
									<div class="value">
										{#if !a_values?.length}
											<span class="meta empty">
												(none)
											</span>
										{:else if a_values.length > 1}
											<ul class="list">
												{#each a_values as s_value, i_value}
													<li style:display="flex">
														<span class="meta prefix">
															{i_value+1}.
														</span>
														<span>
															{s_value}
														</span>
													</li>
												{/each}
											</ul>
										{:else}
											{a_values[0]}
										{/if}
									</div>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			No matching events yet...
		{/if}
	{:else}
		Subscribing...
	{/if}
</section>