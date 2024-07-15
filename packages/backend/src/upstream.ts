import type {Promisable} from '@blake.regalia/belt';
import type {JsonRpcResponse, TendermintEvent, TxResultWrapper} from '@solar-republic/neutrino';
import type {WeakUintStr} from '@solar-republic/types';

import {F_NOOP, __UNDEFINED, parse_json_safe} from '@blake.regalia/belt';
import {TendermintWs} from '@solar-republic/neutrino';

import {GC_APP} from './config';

type BasicBlock = {
	block: {
		header: {
			height: WeakUintStr;
			time: string;
		};
	};
};

type EventHandler<g_type> = (g_result: g_type) => Promisable<void>;
type ErrorHandler = (g_error?: JsonRpcResponse<{}>['error']) => Promisable<void>;

type HandlersStruct<g_type> = {
	internal?: EventHandler<g_type>;
	external?: EventHandler<g_type>;
};


const A_NODES = GC_APP.upstream.nodes;

const {
	url: P_RPC_DEFAULT,
} = A_NODES[0];

class TendermintEventStream<g_type> {
	_f_handler_internal: EventHandler<g_type> = F_NOOP;
	_f_handler_external: EventHandler<g_type> = F_NOOP;

	register({internal:f_internal, external:f_external}: HandlersStruct<g_type>): void {
		if(f_internal) this._f_handler_internal = f_internal;
		if(f_external) this._f_handler_external = f_external;
	}
}

export const G_NODE_INFO = await (async() => {
	const d_res = await fetch(`${P_RPC_DEFAULT}/status`);
	const {
		result: g_result,
	} = await d_res.json();

	return g_result.node_info as {
		protocol_version: {
			p2p: string;
			block: string;
			app: string;
		};
		id: string;
		listen_addr: string;
		network: string;
		version: string;
		channels: string;
		moniker: string;
		other: {
			tx_index: 'on' | 'off';
			rpc_address: string;
		};
	};
})();

export const K_TES_TX = new TendermintEventStream<TendermintEvent<TxResultWrapper>>();
export const K_TES_BLOCK = new TendermintEventStream<TendermintEvent<BasicBlock>>();

// height of earliest/latest block witnessed (via NewBlock event) since process started
let xg_height_earliest = 0n;
let xg_height_latest = 0n;

// subscribe to transaction events
export const K_WS_TX = await TendermintWs(P_RPC_DEFAULT, `tm.event='Tx'`, (d_event) => {
	// parse message JSON
	const g_message = parse_json_safe<JsonRpcResponse<TendermintEvent<TxResultWrapper>>>(d_event.data);

	// ref result
	const g_result = g_message?.result;

	// JSON-RPC success
	if(g_result) {
		// // transaction arrived before block
		// if()
		// debugger;

		// console.log(xg_height_earliest);
		// console.log(xg_height_latest);

		// call handlers
		void K_TES_TX._f_handler_internal(g_result);
		void K_TES_TX._f_handler_external(g_result);
	}
	// JSON-RPC error
	else {
		debugger;

		const g_error = g_message?.error;

		throw g_error;
		// if(g_error) {
		// }

		// const e_error = Error(g_error? `${g_error.message}\n${stringify_json(g_error.data)}`: 'Empty JSON-RPC message');

		// // call handlers
		// void K_TES_TX._f_handler_internal(__UNDEFINED, g_error);
		// void K_TES_TX._f_handler_external(__UNDEFINED, g_error);
	}
});

// subscribe to block events
export const K_WS_BLOCK = await TendermintWs(P_RPC_DEFAULT, `tm.event='NewBlock'`, (d_event) => {
	// parse message JSON
	const g_message = parse_json_safe<JsonRpcResponse<TendermintEvent<BasicBlock>>>(d_event.data);

	// ref result
	const g_result = g_message?.result;

	// JSON-RPC success
	if(g_result) {
		// destructure block data
		const {
			height: sg_height,
			time: s_time,
		} = g_result.data.value.block.header;

		// parse height
		const xg_height = BigInt(sg_height);

		// update heights
		xg_height_earliest ||= xg_height;
		xg_height_latest = xg_height;

		// call handlers
		void K_TES_BLOCK._f_handler_internal(g_result);
		void K_TES_BLOCK._f_handler_external(g_result);
	}
	// JSON-RPC error
	else {
		debugger;

		const g_error = g_message?.error;
		// if(g_error) {
		// }

		throw Error(g_error);
	}
});

