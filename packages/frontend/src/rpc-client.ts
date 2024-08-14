import type {JsonRpcClient} from '#shared/json-rpc';
import type {ServiceVocab} from '#shared/vocab';

import {defer} from '@blake.regalia/belt';

import {JsonRpc} from '#shared/json-rpc.js';

export async function open_ws_rpc(): Promise<JsonRpc<JsonRpcClient, ServiceVocab>> {
	// establish connection
	const d_ws = new WebSocket(process.env['COSMOS_POWER_STREAM_URL'] || `${location.origin}/websocket`);

	const [dp_open, fk_open] = defer();
	d_ws.onopen = fk_open;
	await dp_open;

	const k_rpc = new JsonRpc(d_ws as WebSocket, {
		close(d_event) {
			debugger;
		},
	});

	return k_rpc;
}