import {WebSocketServer} from 'ws';

import {JsonRpc} from './json-rpc';
import {H_ROUTING, MultiplexerClient} from './multiplexer-client';

const N_PORT = parseInt(process.argv['port'] || process.env.PORT || '26659');

const y_server = new WebSocketServer({
	port: N_PORT,
});

y_server.on('connection', (d_ws) => {
	const k_client = new MultiplexerClient();

	new JsonRpc(d_ws as WebSocket, k_client, H_ROUTING);
});
