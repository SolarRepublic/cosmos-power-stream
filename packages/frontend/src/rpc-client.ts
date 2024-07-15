import type {JsonRpcClient} from '../../shared/src/json-rpc';
import {JsonRpc} from '../../shared/src/json-rpc';
import {defer} from '@blake.regalia/belt';


export async function open_ws_rpc(): Promise<JsonRpc<JsonRpcClient>> {
	// establish connection
	const d_ws = new WebSocket('http://localhost:26659/');

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