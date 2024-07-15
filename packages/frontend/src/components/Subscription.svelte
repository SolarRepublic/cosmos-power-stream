<script lang="ts">
	import type {WeakUintStr} from '@solar-republic/types';
	import type {JsonRpc, JsonRpcClient, JsonRpcError} from '../../../shared/src/json-rpc';
	import type {ServiceVocab} from '../../../shared/src/vocab';
	import type {LiveSubscription} from '../types';

	import {try_async, deduplicate} from '@blake.regalia/belt';
	import {onMount} from 'svelte';
	import {walk, type AstNode} from '../../../shared/src/event-query';
	import {block_explorer_tx} from '../util';

	export let k_rpc: JsonRpc<JsonRpcClient, ServiceVocab>;
	export let g_subscription: LiveSubscription;

	let a_txs: {
		hash: string;
		height: WeakUintStr;
		events: Dict<string[]>;
	}[] = [];

	let b_reverse_order = false;

	let g_subscribe: ServiceVocab['subscribe']['returns'] | undefined;
	let z_error: JsonRpcError | Error | 0;
	let as_paths = new Set<string>();

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
	});

</script>

<style lang="less">
	section {
		color: #004;
		background: rgba(210, 210, 255, 0.7);
		border-radius: 4px;
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
</style>

<section>
	{#if z_error}
		Error: {z_error.message}
	{:else if g_subscribe}
		<div>
			<span>
				Query:
			</span>
			<code>{g_subscription.query.replace(/\n+/g, ' ')}</code>
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
					{#each a_txs as g_tx (g_tx.hash)}
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