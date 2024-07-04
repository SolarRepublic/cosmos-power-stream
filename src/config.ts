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
				url: 'http://10.0.0.23:26657',
			},
		],
	},
	downstream: {

	},
};
