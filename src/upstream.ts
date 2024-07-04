import {TendermintEventFilter} from '@solar-republic/neutrino';

import {GC_APP} from './config';

const A_NODES = GC_APP.upstream.nodes;

const {
	url: P_RPC_DEFAULT,
} = A_NODES[0];

export const K_TEF_TX = await TendermintEventFilter(P_RPC_DEFAULT, `tm.event='Tx'`, (d_event) => {

});

export const K_TEF_BLOCK = await TendermintEventFilter(P_RPC_DEFAULT, `tm.event='NewBlock'`, () => {

});

