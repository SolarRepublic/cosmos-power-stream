import type {JsonRpcClient, JsonRpcRouter} from '../../shared/src/json-rpc';

import type {ServiceVocab} from '../../shared/src/vocab';
import type {JsonObject, Dict} from '@blake.regalia/belt';
import type {TendermintAbciExecTxResult} from '@solar-republic/cosmos-grpc/tendermint/abci/types';
import type {TendermintEvent, TxResultWrapper} from '@solar-republic/neutrino';
import type {CwBase64, WeakUintStr} from '@solar-republic/types';

import {__UNDEFINED, bytes_to_base64, bytes_to_text, is_number, is_string, is_undefined, timeout, values} from '@blake.regalia/belt';

import {N_ATTRIBUTE_LIMIT_MAX, N_SEARCH_BATCH_SIZE} from './config';
import {HM_EVALUATORS} from './downstream';
import {decode_tx_data as decode_txres} from './encoding';
import {Y_POSTGRES} from './postgres';
import {G_NODE_INFO} from './upstream';
import {EventQuery, type QueryFunction} from '../../shared/src/event-query';
import {JsonRpcParamsError} from '../../shared/src/json-rpc';
import * as G_PACKAGE_JSON from '../package.json' with {type:'json'};


export class MultiplexerClient implements JsonRpcClient {
	_a_query_funcs: QueryFunction[] = [];

	// associates canonical query string to compiled query function (for unsubscribe identity)
	_h_queries: Dict<QueryFunction[]> = {};

	// remove all subscriptions
	unsubscribeAll(): void {
		// each query function this client created
		for(const f_query of this._a_query_funcs) {
			// delete from evaluators
			HM_EVALUATORS.delete(f_query);
		}
	}

	// socket closed
	close(d_event: CloseEvent): void {
		this.unsubscribeAll();
	}
}

const parse_query = (h_params: JsonObject): EventQuery => {
	const s_query = h_params?.['query'];

	// missing query
	if(!s_query) throw new JsonRpcParamsError(`Missing query parameter in subscribe method`);

	// wrong type
	if(!is_string(s_query)) throw new JsonRpcParamsError(`Wrong JSON type for query parameter in subscribe method; must be a string`);

	// parse query string
	return EventQuery.parse(s_query);
};

export const H_ROUTING: JsonRpcRouter<MultiplexerClient, ServiceVocab> = {
	/**
	 * Info about this module
	 */
	power_stream_info() {
		return {
			version: G_PACKAGE_JSON.version,
			node: {
				network: G_NODE_INFO.network,
				version: G_NODE_INFO.version,
			},
		};
	},

	/**
	 * Tendermint/CometBFT WebSocket JSON-RPC subscribe method
	 * @param h_params 
	 * @param f_respond 
	 * @returns 
	 */
	subscribe(h_params, f_respond) {
		// TODO: enforce maximum limit?

		// parse query string
		const k_query = parse_query(h_params);

		// compile to function
		const f_query = k_query.toFunction();

		// add to evaluator map
		HM_EVALUATORS.set(f_query, f_respond as NonNullable<ReturnType<typeof HM_EVALUATORS['get']>>);

		// remove when socket closes
		this._a_query_funcs.push(f_query);

		// associate to compiled query
		(this._h_queries[k_query.string] ??= []).push(f_query);

		// success
		return {
			ast: k_query.export(),
		};
	},

	/**
	 * Tendermint/CometBFT WebSocket JSON-RPC unsubscribe method
	 * @param h_params 
	 * @returns 
	 */
	unsubscribe(h_params) {
		// parse query
		const k_query = parse_query(h_params);

		// load field
		const {_h_queries} = this;

		// key exists
		if(Object.hasOwn(_h_queries, k_query.string)) {
			// lookup subscriptions associated with given query
			const a_subscriptions = _h_queries[k_query.string];

			// at least one subscription exists
			if(a_subscriptions?.length) {
				// remove one subscription from the list
				const f_query = a_subscriptions.shift()!;

				// remove from map
				HM_EVALUATORS.delete(f_query);

				// list is empty, delete key
				if(!a_subscriptions.length) delete _h_queries[k_query.string];
			}
		}

		// success
		return {};
	},

	/**
	 * Tendermint/CometBFT WebSocket JSON-RPC unsubscribe_all method
	 * @returns 
	 */
	unsubscribe_all(this: MultiplexerClient) {
		// forward to instance
		this.unsubscribeAll();

		// success
		return {};
	},

	/**
	 * Searches 
	 * 
	 * "method": "search_txs",
	 * "params": {
	 * 	"from_height": "5102455",
	 * 	"to_height": "5102600",
	 * 	"query": "wasm.x='j'",
	 * 	"limit": 100,
	 * 	"offset": 100
	 * }
	 * 
	 * @param h_params 
	 */
	search_txs(h_params, f_respond) {
		// parse query
		const k_query = parse_query(h_params);

		// compile to function
		const f_query = k_query.toFunction();

		// compile to SQL
		const {
			output: sx_sql,
			values: a_values,
		} = k_query.toSql();

		// start streaming results asynchronously
		(async() => {
			const sx_preview = sx_sql.replace(/\$(\d+)/g, (s, s_index) => {
				const z_value = a_values[parseInt(s_index as string)-1];
				return null === z_value? 'NULL': Y_POSTGRES.escapeLiteral(z_value ?? '');
			});
			console.log(sx_preview);

			// execute
			const g_res_search = await Y_POSTGRES.query(sx_sql, a_values);

			// destructure
			const {
				rows: a_rows,
			} = g_res_search;

			const as_seen = new Set<string>();

			// start iterating through results in batches
			for(let i_row=0; i_row<a_rows.length; i_row+=N_SEARCH_BATCH_SIZE) {
				// prep results
				const h_txs: Dict<TendermintEvent<TxResultWrapper>> = {};

				// prep query
				const a_txids: string[] = [];

				// select subset of rows
				const a_slice = a_rows.slice(i_row, i_row+N_SEARCH_BATCH_SIZE);

				// each row in batch
				for(const g_row of a_slice) {
					// destructure row
					const {
						id: si_row,
						height: sg_height,
						tx_bytes: atu8_tx_bytes,
						tx_data: atu8_tx_data,
						timestamp: d_timestamp,
					} = g_row as {
						id: WeakUintStr;
						height: WeakUintStr;
						tx_bytes: Uint8Array;
						tx_data: Uint8Array;
						timestamp: Date;
					};

					// decode TxResult
					const {
						index: n_index,
						result: g_result,
					} = decode_txres(atu8_tx_data);

					if(as_seen.has(si_row)) {
						debugger;
					}

					as_seen.add(si_row);

					// inspect the type of `g_result.log`
					debugger;

					// reconstruct transaction
					h_txs[si_row] = {
						data: {
							type: 'tendermint/event/Tx',
							value: {
								TxResult: {
									height: sg_height,
									index: n_index,
									tx: atu8_tx_bytes? bytes_to_base64(atu8_tx_bytes) as CwBase64: __UNDEFINED,
									result: g_result as TendermintAbciExecTxResult,
								},
							},
						},
						events: {},
						query: k_query.string,
					};

					// add transaction ID to list
					a_txids.push(si_row);
				}

				// select events for all the transactions in batch
				const g_res_events = await Y_POSTGRES.query(`
					SELECT * from events_for_transactions($1)
				`, [a_txids]);

				// 
				let si_tx_local = '';
				let h_events_local: Dict<string[]> = {};

				// rebuild dict
				for(const g_row of g_res_events.rows) {
					// destructure row
					const {
						tx_id: si_tx,
						path_text: s_path,
						value_text: s_value_text,
						value_bytes: atu8_value_bytes,
					} = g_row as {
						tx_id: string;
						path_text: string;
						value_text: string | null;
						value_bytes: Uint8Array | null;
					};

					// actual value string
					const s_value = atu8_value_bytes? bytes_to_text(atu8_value_bytes): s_value_text;

					// different tx from previous
					if(si_tx !== si_tx_local) {
						h_events_local = h_txs[si_tx_local=si_tx].events;
					}

					// add value to list
					(h_events_local[s_path] ??= []).push(s_value!);
				}

				// send over socket
				f_respond({
					batch: values(h_txs),
				});

				// process queued events
				await timeout(0);
			}

			console.log({
				sx_sql,
			});

			// signal done
			f_respond({
				finished: true,
			});
		})();

		return {
			ast: k_query.export(),
		};
	},

	/**
	 * Parse query and return the AST
	 * @param h_params 
	 * @returns 
	 */
	parse_query(h_params) {
		// parse query
		const k_query = parse_query(h_params);

		// return AST
		return {
			ast: k_query.export(),
		};
	},

	async attributes(h_params) {
		// ref limit
		const n_limit = h_params?.['limit'];

		// missing limit
		if(is_undefined(n_limit)) throw new JsonRpcParamsError(`Missing limit parameter in attributes method`);

		// wrong type
		if(!is_number(n_limit)) throw new JsonRpcParamsError(`Wrong JSON type for limit parameter in attributes method; must be a number`);

		// ref offset
		const n_offset = h_params?.['offset'];

		// missing offset
		if(is_undefined(n_offset)) throw new JsonRpcParamsError(`Missing offset parameter in attributes method`);

		// wrong type
		if(!is_number(n_limit)) throw new JsonRpcParamsError(`Wrong JSON type for offset parameter in attributes method; must be a number`);

		// limit too great
		if(n_limit > N_ATTRIBUTE_LIMIT_MAX) throw new JsonRpcParamsError(`The limit parameter can only have a maximum value of ${N_ATTRIBUTE_LIMIT_MAX}`);

		// must be non-negative integers
		if(n_limit < 0 || n_offset < 0 || !Number.isInteger(n_limit) || !Number.isInteger(n_offset)) throw new JsonRpcParamsError(`Both limit and offset values must be non-negative integers`);

		// zero limit
		if(!n_limit) return {keys:[]};

		// query
		const g_res = await Y_POSTGRES.query(`
			SELECT p.path_text FROM event_paths p
			WHERE p.path_text NOT LIKE 'wasm.%'
			ORDER BY p.id LIMIT $1 OFFSET $2
		`, [n_limit, n_offset]);

		// destructure
		const {
			rows: a_rows,
		} = g_res;

		return {
			keys: a_rows.map(g => g.path_text),
		};
	},
};
