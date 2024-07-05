import type {JsonObject, JsonValue} from '@blake.regalia/belt';

import type {EventUnlistener} from '@solar-republic/neutrino';

import {__UNDEFINED, entries, is_object, is_string, try_sync} from '@blake.regalia/belt';

import {JsonRpcParamsError, type JsonRpcRouter} from './json-rpc';

import {parse_event_query} from './parser';
import {K_TEF_TX} from './upstream';

export class MultiplexerClient {
	_h_subscriptions: Dict<EventUnlistener[]> = {};

	constructor() {

	}
}


export const H_ROUTING: JsonRpcRouter<MultiplexerClient> = {
	/**
	 * Tendermint/CometBFT WebSocket JSON-RPC subscribe method
	 * @param h_params 
	 * @param f_respond 
	 * @returns 
	 */
	subscribe(h_params, f_respond) {
		const s_query = h_params?.['query'];

		// missing query
		if(!s_query) throw new JsonRpcParamsError(`Missing query parameter in subscribe method`);

		// wrong type
		if(!is_string(s_query)) throw new JsonRpcParamsError(`Wrong JSON type for query parameter in subscribe method; must be a string`);

		// parse query string
		const g_ast = parse_event_query(s_query);

		// simple query
		if('expr' === g_ast.type && ['='].includes(g_ast.op)) {
			// create listener
			const f_unlistener = K_TEF_TX.when(g_ast.key, `${g_ast.value}`, (g_data, h_events) => {
				// forward to client
				f_respond({
					query: s_query,
					data: g_data,
					events: h_events,
				});
			});

			// save
			(this._h_subscriptions[s_query] ??= []).push(f_unlistener);
		}

		// success
		return {};
	},

	unsubscribe(h_params) {
		const s_query = h_params?.['query'];

		// missing query
		if(!s_query) throw new JsonRpcParamsError(`Missing query parameter in unsubscribe method`);

		// wrong type
		if(!is_string(s_query)) throw new JsonRpcParamsError(`Wrong JSON type for query parameter in unsubscribe method; must be a string`);

		// load field
		const {_h_subscriptions} = this;

		// key exists
		if(Object.hasOwn(_h_subscriptions, s_query)) {
			// lookup subscriptions associated with given query
			const a_subscriptions = _h_subscriptions[s_query];

			// at least one subscription exists
			if(a_subscriptions?.length) {
				// remove one subscription from the list
				const f_unlistener = a_subscriptions.shift()!;

				// call unlistener
				f_unlistener();

				// list is empty, delete key
				if(!a_subscriptions.length) delete _h_subscriptions[s_query];
			}
		}

		// success
		return {};
	},


	unsubscribe_all() {
		// each subscription
		for(const [si_key, a_subscriptions] of entries(this._h_subscriptions)) {
			// call each unlistener
			for(const f_unlistener of a_subscriptions || []) {
				f_unlistener();
			}

			// delete key
			delete this._h_subscriptions[si_key];
		}

		// success
		return {};
	},

	/**
	 * 
	 * 
	 * "method": "search_txs",
	 * "params": {
	 * 	"from_height": "5102455",
	 * 	"to_height": "5102600",
	 * 	"where": "wasm.x='j'",
	 * 	"limit": 100,
	 * }
	 * 
	 * @param h_params 
	 */
	search_txs(h_params) {
		const s_query = h_params?.[''];

		// missing query
		if(!s_query) throw new JsonRpcParamsError(`Missing query parameter in subscribe method`);

		// wrong type
		if(!is_string(s_query)) throw new JsonRpcParamsError(`Wrong JSON type for query parameter in subscribe method; must be a string`);
	},
};
