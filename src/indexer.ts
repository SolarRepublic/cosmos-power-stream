import type {TendermintEvent, TxResultWrapper} from '@solar-republic/neutrino';

import {F_IDENTITY, __UNDEFINED, base64_to_bytes, bytes, bytes_to_base64, bytes_to_text, collapse, entries, is_undefined, map_entries, parse_json_safe, sha256, text_to_bytes} from '@blake.regalia/belt';
import {Protobuf} from '@solar-republic/cosmos-grpc';


import {H_ROUTING, MultiplexerClient} from './multiplexer-client';
import {Y_POSTGRES, psql_params} from './postgres';

const R_BIGINTISH = /^([-+]?\d{1,78})([a-z\d_]{1,16}|ibc\/[A-F0-9]{64}|factory\/\S{,120})?$/;
const NL_MAX_VALUE_TEXT = 8192 - 1;

(async() => {
	const k_mpc = new MultiplexerClient();

	await H_ROUTING['subscribe'].call(k_mpc, {
		query: 'tm.event="NewBlock"',
	}, async(g_message, e_rpc) => {
		const {
			data: g_data,
			events: h_events,
		} = g_message as TendermintEvent;

		debugger;
		console.log(g_message);
	});

	await H_ROUTING['subscribe'].call(k_mpc, {
		query: 'tm.event="Tx"',
	}, async(g_message, e_rpc) => {
		const {
			data: g_data,
			events: h_events,
		} = g_message as TendermintEvent<TxResultWrapper>;

		// destructure data
		const {
			value: {
				TxResult: {
					height: sg_height,
					tx: sb64_tx,
					result: g_result,
				},
			},
		} = g_data;

		// transation hash ID
		const si_hash = h_events['tx.hash'][0];

		// timing
		console.time(si_hash);

		// attempt to parse log as JSON
		const g_log = parse_json_safe<{
			events?: {
				type: string;
				attributes: {
					key: string;
					value: string;
				}[];
			}[];
		}>(g_result?.log || '');

		// ref the events array
		const a_log_events = g_log?.events;

		// clone log object
		const g_other = {...g_log};

		// remove events from it
		delete g_other.events;

		// protobuf-encode result.log
		const atu8_log = Protobuf()
			// log.events?
			.B((a_log_events || [])
				.map(g_event => Protobuf().s(g_event.type).B(
					g_event.attributes.map(g_attr => Protobuf().s(g_attr.key).s(g_attr.value).o)
				).o)
			)
			// {...log.<other>}
			.B(map_entries(g_other, ([si_key, w_value]) => Protobuf().s(si_key).s(JSON.stringify(w_value)).o))
			// plain log text (i.e., not JSON)
			.s(is_undefined(g_log)? g_result?.log: __UNDEFINED)
			.o;

		// protobuf-encode result.events[]
		const atu8_result_events = Protobuf().B((g_result?.events || [])
			.map(g_event => Protobuf().s(g_event.type).B(
				g_event.attributes?.map(g_attr => Protobuf().s(g_attr.key).s(g_attr.value).v(!!g_attr.index).o)
			).o)
		).o;

		// protobuf-encode the whole result struct
		const atu8_result = Protobuf()
			.g(g_result?.gas_wanted)
			.g(g_result?.gas_used)
			.b(base64_to_bytes(g_result?.data || ''))
			.b(atu8_log)
			.b(atu8_result_events)
			.v(g_result?.code)
			.s(g_result?.codespace)
			.s(g_result?.info)
			.o;

		// create transaction
		const g_ins_tx = await Y_POSTGRES.query(`
			INSERT INTO transactions(height, tx_bytes, tx_result) VALUES($1, $2, $3) RETURNING id
		`, [sg_height!, base64_to_bytes(sb64_tx!), atu8_result]);

		// transaction row ID
		const sir_tx = g_ins_tx.rows[0].id as string;

		// distinct paths and values
		const a_paths_distinct: string[] = [];
		const as_values_distinct = new Set<string>();

		// each event
		for(const [s_path, a_values] of entries(h_events)) {
			// add distinct path
			a_paths_distinct.push(s_path);

			// each value; add distinct value
			for(const s_value of a_values) {
				as_values_distinct.add(s_value);
			}
		}

		// instance ID
		const si_instance = si_hash.slice(0, 7);

		// encode paths and values to IDs
		const [h_ids_paths, h_ids_values] = await Promise.all([
			// event paths
			(async() => {
				const si_upsert = `Upsert paths: ${si_instance}`;
				console.time(si_upsert);

				const g_res_upsert = await Y_POSTGRES.query(`
					WITH input_rows(path_text) AS (
						VALUES ${a_paths_distinct.map((s_path, i_path) => `($${i_path + 1})`).join(',')}
					), ins AS (
						INSERT INTO event_paths(path_text) 
						SELECT * FROM input_rows
						ON CONFLICT(path_text) DO NOTHING
						RETURNING id, path_text
					)
					SELECT id, path_text FROM ins
					UNION ALL
					SELECT basis.id, basis.path_text
					FROM input_rows
					JOIN event_paths basis USING(path_text)
				`, a_paths_distinct);

				console.timeEnd(si_upsert);

				// create ID lookup
				return collapse(g_res_upsert.rows, g_row => [
					g_row.path_text as string, g_row.id as string,
				]);
			})(),

			// event values
			(async() => {
				// convert Set to Array
				const a_values_distinct = await Promise.all(
					Array.from(as_values_distinct).map(async(s_value) => {
						const a_bigint = R_BIGINTISH.exec(s_value);

						// // bigint
						// if(a_bigint) {
						// 	const [, sg_value, s_unit] = a_bigint;

						// 	// parse bigint
						// 	const xg_value = BigInt(sg_value);

						// 	// too large for postgres 8 byte max
						// 	if(!B_BIGINT_ENABLED && xg_value > 9223372036854775807n) {

						// 	}
						// }

						// // exclude hexadecimal digests
						// if(a_bigint && /^[A-F0-9]{64}$/.test(s_value)) a_bigint = null;

						return [
							bytes_to_base64(await sha256(text_to_bytes(s_value))),
							a_bigint?.[1] || null,  // decimals
							a_bigint?.[2] || null,  // unit
							s_value.length < NL_MAX_VALUE_TEXT? s_value: null,  // text
							s_value.length < NL_MAX_VALUE_TEXT? null: text_to_bytes(s_value),  // raw bytes
						];
					}));

				const si_upsert = `Upsert values: ${si_instance}`;
				console.time(si_upsert);

				// param builder for values
				const f_param = psql_params();

				// upsert values
				const sx_upsert = `
					WITH input_rows(value_hash, value_bigint, value_unit, value_text, value_bytes) AS (
						VALUES ${a_values_distinct.map((s_value, i_path) => '('+[
							/* eslint-disable @typescript-eslint/indent */
							// `$${(i_path*5)+1}`,
							f_param(),
							`CAST(${f_param()} AS DECIMAL)`,
							f_param(),
							f_param(),
							// `$${(i_path*4)+3}`,
							`CAST(${f_param()} AS BYTEA)`,
							// f_param(),
						].join(', ')+')').join(',') /* eslint-enable */}
					), ins AS (
						INSERT INTO event_values(value_hash, value_bigint, value_unit, value_text, value_bytes) 
						SELECT * FROM input_rows
						ON CONFLICT(value_hash) DO NOTHING
						RETURNING id, value_text, value_bytes
					)
					SELECT id, value_text, value_bytes FROM ins
					UNION ALL
					SELECT basis.id, basis.value_text, basis.value_bytes
					FROM input_rows
					JOIN event_values basis USING(value_hash)
				`;
				// 
				const g_res_upsert = await Y_POSTGRES.query(sx_upsert, a_values_distinct.flatMap(F_IDENTITY));

				console.timeEnd(si_upsert);

				// create ID lookup
				return collapse(g_res_upsert.rows, g_row => [
					g_row.value_text ?? bytes_to_text(g_row.value_bytes as Uint8Array),
					g_row.id as string,
				]);
			})(),
		]);

		const a_events_ins: [string, string][] = [];

		// encode each event
		for(const [s_path, a_values] of entries(h_events)) {
			for(const s_value of a_values) {
				a_events_ins.push([h_ids_paths[s_path], h_ids_values[s_value]]);
			}
		}

		// insert all events from this transaction, having encoded paths and values
		await Y_POSTGRES.query(`
			INSERT INTO events(tx_id, path_id, value_id)
			VALUES ${a_events_ins.map((s, i_ins) => `('${sir_tx}', $${(i_ins * 2) + 1}, $${(i_ins * 2) + 2})`).join(',')}
		`, a_events_ins.flatMap(F_IDENTITY));

		// timing
		console.timeEnd(si_hash);
	});
})();
