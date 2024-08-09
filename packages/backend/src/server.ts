import type {PlainJsonRpcRouter} from '../../shared/src/json-rpc';

import {parseArgs} from 'node:util';

import {WebSocketServer} from 'ws';

import {H_ROUTING, MultiplexerClient} from './multiplexer-client';
import {JsonRpc} from '../../shared/src/json-rpc';

// parse CLI args
const {
	values: {
		port: S_ARGV_PORT,
	},
} = parseArgs({
	args: process.argv.slice(2),
	options: {
		port: {
			type: 'string',
			short: 'p',
			default: '26659',
		},
	},
});

// parse port as integer
const N_PORT = parseInt(S_ARGV_PORT!);

// launch WebSocket server
const y_server = new WebSocketServer({
	port: N_PORT,
});

// listen for new connections
y_server.on('connection', (d_ws) => {
	// 
	const k_client = new MultiplexerClient();

	new JsonRpc(d_ws as WebSocket, k_client, H_ROUTING as unknown as PlainJsonRpcRouter<MultiplexerClient>);
});

//
console.log(`Listening on :${N_PORT}`);
