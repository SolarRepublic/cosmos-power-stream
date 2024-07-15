import type {JsonObject, JsonValue} from '@blake.regalia/belt';
import type {TxResultWrapper} from '@solar-republic/neutrino';

export type GenericVocab = {
	[si_method: string]: {
		params: JsonObject;
		returns: JsonValue;
		streams: JsonValue | void;
	};
};

type StreamEvent = {
	data: {
		type: 'tendermint/event/Tx',
		value: TxResultWrapper;
	};
	events: Dict<string[]>;
	query: string;
};

export type ServiceVocab = {
	power_stream_info: {
		params: {};
		returns: {
			version: string;
			node: {
				network: string;
				version: string;
			};
		};
		streams: void;
	};

	subscribe: {
		params: {
			query: string;
		};
		returns: {
			ast: JsonObject;
		};
		streams: StreamEvent;
	};

	parse_query: {
		params: {
			query: string;
		};
		returns: {
			ast: JsonObject;
		};
		streams: void;
	};

	search_txs: {
		params: {
			query: string;
		};
		returns: {
			ast: JsonObject;
		};
		streams: {
			batch?: StreamEvent[];
			finished?: true;
		};
	};
};

export type ClientVocab = {
};
