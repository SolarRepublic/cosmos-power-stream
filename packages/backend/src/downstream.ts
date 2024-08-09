import type {QueryFunction} from '../../shared/src/event-query';
import type {TendermintEvent, TxResultWrapper} from '@solar-republic/neutrino';

import {K_TES_TX} from './upstream';
import {R_BIGINTISH} from '../../shared/src/event-query';

// global list of evaluators
export const HM_EVALUATORS = new Map<QueryFunction, (g_result: TendermintEvent<TxResultWrapper>) => void>();

// scope to provide to each compiled function
const G_SCOPE = {
	R_BIGINTISH,
};

// register with the event stream
K_TES_TX.register({
	// register the external handler
	external(g_result) {
		// destructure result
		const {
			data: g_data,
			events: h_events,
		} = g_result;

		// each evaluator entry in current map
		for(const [f_query, f_accept] of HM_EVALUATORS.entries()) {
			// evaluate the query, passing in the events and scope; query hit
			if(f_query(h_events, G_SCOPE)) {
				// attempt to accept the transaction event
				try {
					f_accept(g_result);
				}
				// something went wrong
				catch(e_accept) {
					// log and move on
					console.warn(e_accept);
				}
			}
		}
	},
});
