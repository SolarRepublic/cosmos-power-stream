import type {TrustedContextUrl} from '@solar-republic/types';

type AppConfig = {
	upstream: {
		nodes: {
			url: TrustedContextUrl;
		}[];
	};

	downstream: {

	};
};

export const GC_APP: AppConfig = {
	upstream: {
		nodes: [
			{
				url: (process.env['UPSTREAM_RPC_NODE'] || 'http://localhost:26657') as TrustedContextUrl,
			},
		],
	},
	downstream: {

	},
};

export const N_SEARCH_BATCH_SIZE = 256;

export const N_ATTRIBUTE_LIMIT_MAX = 1024;

export const X_MAX_TX_AGE_HOURS = 14 * 24;

export const XT_HOUSECLEAN_INTERVAL = 1 * 60 * 60e3;
