import type {JsonObject, JsonValue, Promisable} from '@blake.regalia/belt';

import {assign, is_dict, is_error, is_number, is_object, is_string, parse_json_safe, stringify_json} from '@blake.regalia/belt';


type JsonRpcError = {
	code: number;
	message: string;
	data?: JsonValue;
};

type JsonRpcResponder = (z_result: JsonValue, e_error?: JsonRpcError) => void;

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export type JsonRpcRouter<w_instance> = {
	[si_method: string]: (this: w_instance, h_params: Dict<JsonValue>, f_respond: JsonRpcResponder) => Promisable<JsonValue | void | undefined>;
};

export class JsonRpcParamsError extends Error {}

export class JsonRpc<w_instance> {
	constructor(
		protected _d_ws: WebSocket,
		protected _w_instance: w_instance,
		protected _h_router: JsonRpcRouter<w_instance>
	) {
		_d_ws.onmessage = d_event => void this.message(d_event);
	}

	terminate(xc_code: number, s_reason='') {
		this._d_ws.close(xc_code, s_reason);
	}

	/**
	 * Sends a JSON-RPC message to the client
	 * @param g_message - arbitrary JSON to spread into the message
	 */
	send(g_message: JsonObject): void {
		this._d_ws.send(stringify_json({
			jsonrpc: '2.0',
			...g_message,
		}));
	}

	/**
	 * 
	 * @param d_event 
	 * @returns 
	 */
	error(xc_code: number, s_message: string, z_data?: JsonValue): void {
		this.send({
			error: {
				code: xc_code,
				message: s_message,
				data: z_data,
			},
		});
	}

	_reject(s_data: string): void {
		this.error(-32600, 'Invalid request', s_data);
	}

	async message(d_event: MessageEvent<any>) {
		const sx_message = d_event.data;

		// not a string; err
		if(!is_string(sx_message)) return this.error(-32700, 'Parse error. Invalid JSON', 'Message must be JSON-RPC string');

		// parse JSON
		const g_message = parse_json_safe(sx_message);

		// not a struct; err
		if(!g_message || !is_dict(g_message)) return this._reject('Message content must be JSON-RPC struct');

		// not JSON-RPC
		if('2.0' !== g_message['jsonrpc']) return this._reject('Message content must contain {"jsonrpc": "2.0"}');

		// destructure call
		const {
			id: z_id,
			method: si_method,
			params: h_params,
		} = g_message;

		// invalid method type
		if(!is_string(si_method)) return this._reject(`Wrong JSON type for method value; must be a string`);

		// params not omitted and invalid type
		if(h_params && !is_dict(h_params)) return this._reject(`Wrong JSON type for params value; must be a struct`);

		// id is not null
		if(null !== z_id) {
			// id is a string
			if(is_string(z_id)) {
				// but its empty
				if(!z_id) return this.error(-32080, 'Invalid ID', 'ID must not be an empty string. Use null if you want to omit it');
			}
			// id is a number
			else if(is_number(z_id)) {
				// but its not an integer
				if(!Number.isInteger(z_id)) return this.error(-32080, 'Invalid ID', 'ID must be an integer. Decimals are not allowed');
			}
			// something else
			else {
				return this.error(-32080, 'Invalid ID', 'ID must be a string or number (integer)');
			}

			// id is too long
			if(`${z_id}`.length > 36) return this.error(-32080, 'ID too long', 'Maximum length allowed is 36 characters');
		}

		// no such method
		if(!Object.hasOwn(this._h_router, si_method)) return this.error(-32601, 'Method not found', `"${si_method}" does not exist`);

		// wrap in try/catch
		try {
			// call method
			const w_result = await this._h_router[si_method].call(this._w_instance, h_params as Dict<JsonValue>, (z_result) => {
				this.send({
					id: z_id,
					result: z_result,
				});
			});

			// result was returned
			if(w_result) {
				this.send({
					id: z_id,
					result: w_result,
				});
			}
		}
		// error while evaluating
		catch(e_call) {
			if(is_error(e_call)) {
				if(e_call instanceof JsonRpcParamsError) {
					this.error(-32602, 'Invalid params', e_call.message);
				}
				else {
					this.error(-32603, 'Internal error', e_call.message);
				}
			}
			else {
				this.error(-32603, 'Internal error', `${e_call as string}`);
			}
		}
	}
}
