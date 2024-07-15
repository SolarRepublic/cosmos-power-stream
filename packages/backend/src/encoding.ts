import type {JsonValue} from '@blake.regalia/belt';
import type {TendermintAbciTxResult} from '@solar-republic/cosmos-grpc/tendermint/abci/types';

import type {CwBase64, WeakUintStr} from '@solar-republic/types';

import {__UNDEFINED, base64_to_bytes, bytes_to_base64, from_entries, is_undefined, map_entries, parse_json, parse_json_safe, stringify_json} from '@blake.regalia/belt';
import {decode_protobuf, ProtoHint, Protobuf} from '@solar-republic/cosmos-grpc';


export function encode_txres(g_txres: TendermintAbciTxResult): Uint8Array {
	// destructure TxResult
	const {
		index: n_index,
		result: g_result,
	} = g_txres;

	// attempt to parse logs as JSON
	const a_logs = parse_json_safe<{
		events?: {
			type: string;
			attributes: {
				key: string;
				value: string;
			}[];
		}[];
	}[]>(g_result?.log || '');

	// logs
	const atu8_logs = Protobuf()
		.B((a_logs || []).map((g_log) => {
			// ref the events array
			const a_log_events = g_log?.events;

			// clone log object
			const g_other = {...g_log};

			// remove events from it
			delete g_other.events;

			// protobuf-encode result.log
			return Protobuf()
				// log.events?
				.B((a_log_events || [])
					.map(g_event => Protobuf()
						.B(g_event.attributes.map(g_attr => Protobuf()
							.s(g_attr.key)
							.s(g_attr.value)
							.o
						))
						.s(g_event.type)
						.o
					)
				)
				// {...log.<other>}
				.B(map_entries(g_other, ([si_key, w_value]) => Protobuf().s(si_key).s(stringify_json(w_value)).o))
				// plain log text (i.e., not JSON)
				.s(is_undefined(g_log)? g_result?.log: __UNDEFINED)
				.o;
		})).o;

	// protobuf-encode result.events[]
	const atu8_result_events = Protobuf()
		.B((g_result?.events || []).map(g_event => Protobuf()
			.B(g_event.attributes?.map(g_attr => Protobuf()
				.s(g_attr.key)
				.s(g_attr.value)
				.v(!!g_attr.index)
				.o
			))
			.s(g_event.type)
			.o
		)).o;

	// protobuf-encode result
	const atu8_result = g_result? Protobuf()
		.b(atu8_logs)
		.b(atu8_result_events)
		.g(g_result.gas_wanted)
		.g(g_result.gas_used)
		.b(base64_to_bytes(g_result.data || ''))
		.v(g_result.code)
		.s(g_result.codespace)
		.s(g_result.info)
		.o: __UNDEFINED;

	// protobuf-encode the data
	return Protobuf()
		.b(atu8_result)
		.v(n_index)
		.o;
}


function decode_tx_log_events_attribute(atu8_attribute: Uint8Array) {
	const [
		s_key,
		s_value,
	] = decode_protobuf<[
		string,
		string,
	]>(atu8_attribute, [
		ProtoHint.SINGULAR_STRING,  // key
		ProtoHint.SINGULAR_STRING,  // value
	]);

	return {
		key: s_key,
		value: s_value,
	};
}

function decode_tx_log_events(atu8_events: Uint8Array) {
	const [
		a_attributes,
		s_type,
	] = decode_protobuf(atu8_events, [
		ProtoHint.MESSAGE,
		ProtoHint.SINGULAR_STRING,
	], [decode_tx_log_events_attribute]) as unknown as [
		ReturnType<typeof decode_tx_log_events_attribute>[],
		string,
	];

	return {
		type: s_type,
		attributes: a_attributes,
	};
}

function decode_tx_other(atu8_other: Uint8Array) {
	const [
		si_key,
		sx_value,
	] = decode_protobuf<[
		string,
		string,
	]>(atu8_other, [
		ProtoHint.SINGULAR_STRING,
		ProtoHint.SINGULAR_STRING,
	]);

	return [si_key, parse_json_safe(sx_value)] as [string, JsonValue];
}

function decode_tx_logs_log(atu8_tx_logs_log: Uint8Array) {
	const [
		a_events,
		a_others,
		s_plain,
	] = decode_protobuf(atu8_tx_logs_log, [
		ProtoHint.NONE,
		ProtoHint.NONE,
		ProtoHint.SINGULAR_STRING,
	], [decode_tx_log_events, decode_tx_other]) as unknown as [
		ReturnType<typeof decode_tx_log_events>[],
		ReturnType<typeof decode_tx_other>[],
		string,
	];

	// plain log text
	if(s_plain) return s_plain;

	// rebuild struct, then stringify back to JSON
	return stringify_json({
		...from_entries(a_others || []),
		events: a_events,
	});
}

function decode_tx_logs(atu8_tx_logs: Uint8Array) {
	const [
		a_logs,
	] = decode_protobuf(atu8_tx_logs, [
		ProtoHint.MESSAGE,
	], [decode_tx_logs_log]);

	return a_logs;
}

function decode_tx_result_events_event_attribute(atu8_attribute: Uint8Array) {
	const [
		s_key,
		s_value,
		n_index,
	] = decode_protobuf<[
		string,
		string,
		number,
	]>(atu8_attribute, [
		ProtoHint.SINGULAR_STRING,  // key
		ProtoHint.SINGULAR_STRING,  // value
		ProtoHint.SINGULAR,  // index
	]);

	return {
		key: s_key,
		value: s_value,
		index: !!n_index,
	};
}

function decode_tx_result_events_event(atu8_event: Uint8Array) {
	const [
		a_attributes,
		s_type,
	] = decode_protobuf(atu8_event, [
		ProtoHint.MESSAGE,
		ProtoHint.SINGULAR_STRING,
	], [decode_tx_result_events_event_attribute]) as unknown as [
		ReturnType<typeof decode_tx_result_events_event_attribute>[],
		string,
	];

	return {
		type: s_type,
		attributes: a_attributes,
	};
}

function decode_tx_result_events(atu8_events: Uint8Array) {
	const [
		a_events,
	] = decode_protobuf<[]>(atu8_events, [
		ProtoHint.MESSAGE,
	], [
		decode_tx_result_events_event,
	]) as unknown as [
		ReturnType<typeof decode_tx_result_events_event>[],
	];

	return a_events;
}

function decode_tx_result(atu8_tx_result: Uint8Array) {
	const [
		s_log,
		a_events,
		sg_gas_wanted,
		sg_gas_used,
		atu8_data,
		xc_code,
		s_codespace,
		s_info,
	] = decode_protobuf(atu8_tx_result, [
		ProtoHint.SINGULAR_MESSAGE,  // log
		ProtoHint.SINGULAR_MESSAGE,  // events
		ProtoHint.SINGULAR_BIGINT,  // gas wanted
		ProtoHint.SINGULAR_BIGINT,  // gas used
		ProtoHint.SINGULAR,  // data
		ProtoHint.SINGULAR,  // code
		ProtoHint.SINGULAR_STRING,  // codespace
		ProtoHint.SINGULAR_STRING,  // info
	], [decode_tx_logs, decode_tx_result_events]) as unknown as [
		ReturnType<typeof decode_tx_logs>,
		ReturnType<typeof decode_tx_result_events>,
		WeakUintStr,
		WeakUintStr,
		Uint8Array,
		number,
		string,
		string,
	];

	return {
		code: xc_code,
		codespace: s_codespace,
		info: s_info,
		log: s_log,
		gas_wanted: sg_gas_wanted,
		gas_used: sg_gas_used,
		data: bytes_to_base64(atu8_data) as CwBase64,
		events: a_events,
	};
}

export function decode_tx_data(atu8_tx_data: Uint8Array) {
	// decode result
	const [
		g_result,
		n_index,
	] = decode_protobuf(atu8_tx_data, [
		ProtoHint.SINGULAR,
		ProtoHint.SINGULAR,
	], [
		decode_tx_result,
	]) as [
		ReturnType<typeof decode_tx_result>,
		number,
	];

	return {
		index: n_index,
		result: g_result,
	};
}
