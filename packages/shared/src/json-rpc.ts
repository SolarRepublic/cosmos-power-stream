import type {JsonObject, JsonValue, Promisable, AsJson} from '@blake.regalia/belt';
import type {GenericVocab} from './vocab';

import {__UNDEFINED, assign, bytes_to_text, defer, is_bytes, is_dict, is_error, is_number, is_string, parse_json_safe, stringify_json, try_sync} from '@blake.regalia/belt';


export type JsonRpcError = {
	code: number;
	message: string;
	data?: JsonValue;
};

type JsonRpcResponder<w_result extends JsonValue=JsonValue> = (z_result: w_result, e_error?: JsonRpcError) => void;

type WebSocketMessageEvent = MessageEvent | Parameters<NonNullable<WebSocket['onmessage']>>[0];


// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export type PlainJsonRpcRouter<w_instance> = {
	[si_method: string]: (this: w_instance, h_params: Dict<JsonValue>, f_respond: JsonRpcResponder) => Promisable<JsonValue | void | undefined>;
};

export type JsonRpcRouter<w_instance, h_vocab extends GenericVocab> = {
	[si_method in keyof h_vocab]: (
		this: w_instance,
		h_params: h_vocab[si_method]['params'],
		f_respond: void extends h_vocab[si_method]['streams']
			? void
			: JsonRpcResponder<AsJson<h_vocab[si_method]['streams']>>,
	) => Promisable<h_vocab[si_method]['returns']>;
};

export class JsonRpcParamsError extends Error {}

export interface JsonRpcClient {
	close(d_event: CloseEvent): void;
}

// export class JsonRpcErrorWrapper extends Error {
// 	constructor(protected _g_error: JsonRpcError) {
// 		super(`JSON-RPC Error ${_g_error.code}: ${_g_error.message}`);
// 	}
// }

let c_msgs = 0;

export class JsonRpc<
	k_instance extends JsonRpcClient,
	g_vocab_remote extends GenericVocab,
> {
	protected _h_results: Dict<JsonRpcResponder> = Object.create(null);

	constructor(
		protected _d_ws: WebSocket,
		protected _k_instance: k_instance,
		protected _h_router: PlainJsonRpcRouter<k_instance>={}
	) {
		_d_ws.onmessage = d_event => void this.message(d_event);
		_d_ws.onclose = d_event => void _k_instance.close(d_event as unknown as CloseEvent);
	}

	terminate(xc_code: number, s_reason='') {
		this._d_ws.close(xc_code, s_reason);
	}

	/**
	 * Sends a JSON-RPC message to the client
	 * @param g_message - arbitrary JSON to spread into the message
	 */
	send(g_message: JsonObject): void {
		console.debug(`> ${stringify_json(g_message).slice(0, 256)}`);
		this._d_ws.send(stringify_json({
			jsonrpc: '2.0',
			...g_message,
		}));
	}

	async call<si_method extends Extract<keyof g_vocab_remote, string>, g_method extends g_vocab_remote[si_method]>(
		si_method: si_method,
		g_params: g_method['params'],
		f_receive?: JsonRpcResponder<AsJson<g_method['streams']>>
	): Promise<g_method['returns']> {
		let i_msg = c_msgs++;

		const [dp_respond, fke_respond] = defer();

		this._h_results[i_msg] = (w_result, w_error) => {
			this._h_results[i_msg] = f_receive as JsonRpcResponder;
			fke_respond(w_result as any, w_error as any);
		};

		this.send({
			id: i_msg,
			method: si_method,
			params: g_params,
		});

		return await dp_respond;
	}

	/**
	 * 
	 * @param d_event 
	 * @returns 
	 */
	error(xc_code: number, s_message: string, z_data?: JsonValue, z_id?: JsonValue | undefined): void {
		this.send({
			id: z_id,
			error: {
				code: xc_code,
				message: s_message,
				data: z_data,
			},
		});
	}

	_reject(s_data: string, z_id?: JsonValue | undefined): void {
		this.error(-32600, 'Invalid request', s_data, z_id);
	}

	async message(d_event: WebSocketMessageEvent): Promise<void> {
		const z_message = d_event.data;
		let sx_message = '';

		// bytes
		if(is_bytes(z_message)) {
			// attempt to UTF-8 decode it
			const [sx_decoded, e_decode] = try_sync(() => bytes_to_text(z_message));
			if(e_decode) {
				console.error(`WebSocket received data that failed to UTF-8 decode`);
				return;
			}

			sx_message = sx_decoded || '';
		}
		// string
		else if(is_string(z_message)) {
			sx_message = z_message;
		}
		// other
		else {
			console.error(`WebSocket received data that was neither text nor binary`);
			return;
		}

		// parse JSON
		const g_message = parse_json_safe(sx_message!);

		// not a struct; err
		if(!g_message || !is_dict(g_message)) return this._reject('Message content must be JSON-RPC struct');

		// not JSON-RPC
		if('2.0' !== g_message['jsonrpc']) return this._reject('Message content must contain {"jsonrpc": "2.0"}');

		// destructure call
		const {
			id: z_id,
			method: si_method,
			params: h_params,
			result: g_result,
			error: z_error,
		} = g_message;

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

		// result callback
		if('result' in g_message || 'error' in g_message) {
			const {_h_results} = this;

			// lookup resolver
			const fke_resolve = _h_results[z_id!];
			if(fke_resolve) {
				// error is present
				if(is_dict(z_error)) {
					fke_resolve(__UNDEFINED, z_error as JsonRpcError);
				}
				// result value
				else {
					fke_resolve(g_result);
				}

				// done
				return;
			}

			// unsolicited
			console.warn(`Ignoring unsolicited result`);

			// ignore
			return;
		}

		// invalid method type
		if(!is_string(si_method)) return this._reject(`Wrong JSON type for method value; must be a string`, z_id);

		// params not omitted and invalid type
		if(h_params && !is_dict(h_params)) return this._reject(`Wrong JSON type for params value; must be a struct`, z_id);

		// no such method
		if(!Object.hasOwn(this._h_router, si_method)) return this.error(-32601, 'Method not found', `"${si_method}" does not exist`, z_id);

		// wrap in try/catch
		try {
			// call method
			const w_result = await this._h_router[si_method].call(this._k_instance, h_params as Dict<JsonValue>, (z_result) => {
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
					this.error(-32602, 'Invalid params', e_call.message, z_id);
				}
				else {
					console.error(e_call);
					this.error(-32603, 'Internal error', e_call.message, z_id);
				}
			}
			else {
				this.error(-32603, 'Internal error', `${e_call as string}`, z_id);
			}
		}
	}
}
