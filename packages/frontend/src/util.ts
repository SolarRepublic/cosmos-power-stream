import type {Dict} from '@blake.regalia/belt';

import {entries} from '@blake.regalia/belt';

const P_BLOCK_EXPLORER_PATTERN_TX = 'https://www.mintscan.io/{chainShort}/tx/{hash}';


export const block_explorer_tx = (h_params: Dict): string => {
	let p_url = P_BLOCK_EXPLORER_PATTERN_TX;

	for(const [si_param, s_value] of entries(h_params)) {
		p_url = p_url.replace(`{${si_param}}`, s_value);
	}

	return p_url;
};
