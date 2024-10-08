import {F_IDENTITY, __UNDEFINED, base64_to_bytes, bytes_to_base64, bytes_to_text, collapse, entries, sha256, text_to_bytes} from '@blake.regalia/belt';

import {X_MAX_TX_AGE_HOURS, XT_HOUSECLEAN_INTERVAL} from './config';
import {encode_txres} from './encoding';
import {Y_POSTGRES, psql_params} from './postgres';
import {K_TES_TX} from './upstream';
import {NL_MAX_VALUE_TEXT} from '../../shared/src/config';
import {R_BIGINTISH} from '../../shared/src/event-query';

// // new block events
// K_TES_BLOCK.register({
// 	async external(g_message, e_rpc) {
// 		const {
// 			data: g_data,
// 			events: h_events,
// 		} = g_message as TendermintEvent;

// 		debugger;
// 		console.log(g_message);
// 	},
// });

// transaction events
K_TES_TX.register({
	// register internal handler
	async internal(g_message) {
		// destructure message
		const {
			data: g_data,
			events: h_events,
		} = g_message;

		// destructure data
		const {
			value: {
				TxResult: g_unwrapped,
				TxResult: {
					height: sg_height,
					tx: sb64_tx,
				},
			},
		} = g_data;

		// transation hash ID
		const si_hash = h_events['tx.hash'][0];

		// timing
		console.time(si_hash);

		// encode TxResult
		const atu8_data = encode_txres(g_unwrapped);

		// create transaction
		const g_ins_tx = await Y_POSTGRES.query(`
			INSERT INTO transactions(height, tx_bytes, tx_data) VALUES($1, $2, $3) RETURNING id
		`, [sg_height!, base64_to_bytes(sb64_tx!), atu8_data]);

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
							f_param(),
							`CAST(${f_param()} AS DECIMAL)`,
							f_param(),
							f_param(),
							`CAST(${f_param()} AS BYTEA)`,
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
	},
});

// housecleaning
setInterval(async() => {
	// remove old transactions
	await Y_POSTGRES.query(`
		DELETE FROM transactions
		WHERE timestamp < NOW() - INTERVAL $1
	`, [`${X_MAX_TX_AGE_HOURS} hours`]);
}, XT_HOUSECLEAN_INTERVAL);
