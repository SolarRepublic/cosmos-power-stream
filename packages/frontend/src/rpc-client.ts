import type {JsonRpcClient} from '../../shared/src/json-rpc';
import {JsonRpc} from '../../shared/src/json-rpc';
import {defer} from '@blake.regalia/belt';
import type { ServiceVocab } from '../../shared/src/vocab';


export async function open_ws_rpc(): Promise<JsonRpc<JsonRpcClient, ServiceVocab>> {
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