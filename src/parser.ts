const R_EXPR_HEAD = /\s*([\w-.]+|`[^`]+`)(\s*[><!]?=\s*|\s+(?:includes|matches)\s+)([-+]\d+(?:\.\d+)|['"`])/iy;
const R_EXPR_VALUE_IRK = /([^\\']+|\\[^])*'/y;
const R_EXPR_VALUE_DIRK = /([^\\"]+|\\[^])*"/y;
const R_EXPR_VALUE_TICK = /([^\\`]+|\\[^])*`/y;

const R_EXPR_GROUP_ENTER = /\s*\(/y;
const R_EXPR_GROUP_EXIT = /\s*\)/y;
const R_EXPR_CONTINUATION = /\s+(AND|OR)\s+/iy;

type QueryExprOperator =
	| '>='
	| '<='
	| '!='
	| '='
	| 'includes'
	| 'matches'
	| 'anyof';

type AstNodeCondition = {
	type: 'and' | 'or';
	lhs: AstNode;
	rhs: AstNode;
};

type AstNodeExpr = {
	type: 'expr';
	key: string;
	op: QueryExprOperator;
	value: bigint | number | string;
};

type AstNode = AstNodeCondition | AstNodeExpr;

type AstScope = {
	condition: AstNodeCondition;
};

const H_VALUE_EXTRACTORS = {
	"'": R_EXPR_VALUE_IRK,
	'"': R_EXPR_VALUE_DIRK,
	'`': R_EXPR_VALUE_TICK,
};

class ParsingError extends Error {}

export function parse_query(s_query: string): AstNode {
	// set match index to beginning of query
	let i_match = 0;

	const a_stack: AstScope[] = [];

	let g_scope: AstScope | null = null;

	const g_root = {};

	// node
	let g_node!: AstNode;

	let g_condition: AstNodeCondition | null = null;
	// let g_prev = null;

	const push_to_stack = () => {
		if(g_scope) a_stack.push(g_scope);

		g_scope = {
			condition: g_condition!,
		};

		g_condition = null;
	};

	for(; i_match<s_query.length;) {
		// entering a group
		R_EXPR_GROUP_ENTER.lastIndex = i_match;
		const m_enter = R_EXPR_GROUP_ENTER.exec(s_query);
		if(m_enter) {
			// update match position
			i_match = R_EXPR_GROUP_ENTER.lastIndex;

			// 
			push_to_stack();

			// restart
			continue;
		}

		// exitting a group
		R_EXPR_GROUP_EXIT.lastIndex = i_match;
		const m_exit = R_EXPR_GROUP_EXIT.exec(s_query);
		if(m_exit) {
			// no group to exit
			if(!a_stack.length) throw new ParsingError(`Extraneous closing paren at position ${i_match}`);

			// in the middle of a condition
			if(g_condition) throw new ParsingError(`Cannot terminate a group in the middle of a condition at position ${i_match}`);

			// update match position
			i_match = R_EXPR_GROUP_EXIT.lastIndex;

			({
				condition: g_condition,
			} = a_stack.pop()!);

			// restart
			continue;
		}

		// expression
		R_EXPR_HEAD.lastIndex = i_match;
		const m_expr = R_EXPR_HEAD.exec(s_query);

		// invalid query
		if(!m_expr) throw new ParsingError(`Invalid query starting at position ${i_match}`);

		// update match position
		i_match = R_EXPR_HEAD.lastIndex;

		// destructure expression
		const [, s_key, s_op_raw, s_value_head] = m_expr;

		// remove whitespace from operator
		const s_op = s_op_raw.trim() as QueryExprOperator;

		// prep expression object
		const g_expr = {
			type: 'expr',
			key: s_key,
			op: s_op,
		} as AstNodeExpr;

		// assign to node
		g_node = g_expr;

		// string
		if(/['"`]/.test(s_value_head)) {
			// lookup regex associated with string delimiter
			const r_expr_value = H_VALUE_EXTRACTORS[s_value_head as keyof typeof H_VALUE_EXTRACTORS];

			// set position to start match
			r_expr_value.lastIndex = i_match;

			// execute regex
			const m_value = r_expr_value.exec(s_query);

			// no match
			if(!m_value) throw new ParsingError(`While parsing value for key ${s_key}`);

			// update match position
			i_match = r_expr_value.lastIndex;

			// destructure match
			const [s_value_tail] = m_value;

			// unescape and remove trailing delimiter
			const s_value = s_value_tail.slice(0, -1).replace(/\\([^])/g, '$1');

			// set value
			g_expr.value = s_value;

			// debugger;
		}
		// integer
		else if(/^\d+$/.test(s_value_head)) {
			const xg_value = BigInt(s_value_head);

			// set value
			g_expr.value = xg_value;
		}
		// float
		else {
			const x_value = parseFloat(s_value_head);

			// set value
			g_expr.value = x_value;
		}

		// rhs of existing condition
		if(g_condition) {
			// OR type
			if('or' === g_condition.type) {
				push_to_stack();
			}

			debugger;
			g_condition.rhs = g_expr;

			// condition is now the node
			g_node = g_condition;

			// close condition
			g_condition = null;
		}
		else if(g_scope?.condition) {
			debugger;
			g_scope.condition;
		}

		// continuation
		R_EXPR_CONTINUATION.lastIndex = i_match;
		const m_cont = R_EXPR_CONTINUATION.exec(s_query);
		if(m_cont) {
			// destructure continuation
			const [, s_keyword] = m_cont;

			// update match position
			i_match = R_EXPR_CONTINUATION.lastIndex;

			// prepare new condition
			g_condition = {
				type: s_keyword.toLowerCase(),
				lhs: g_node,
			} as AstNodeCondition;
		}
	}

	return g_node;
}

// // parse_query(`tm.event="NewBlock\\"T\\\\est\\"" AND (other != 'yellow' OR kv >= 8500)`);

// parse_query(`a='b' OR c='d' AND e='f'`);
// const g_expect1 = {
// 	type: 'or',
// 	lhs: {
// 		type: 'expr',
// 		op: '=',
// 		key: 'a',
// 		value: 'b',
// 	},
// 	rhs: {
// 		type: 'and',
// 		lhs: {
// 			type: 'expr',
// 			op: '=',
// 			key: 'c',
// 			value: 'd',
// 		},
// 		rhs: {
// 			type: 'expr',
// 			op: '=',
// 			key: 'e',
// 			value: 'f',
// 		},
// 	},
// };

// debugger;
// parse_query(`(a='b' AND (c='d' OR (e='f' AND g='h') OR i='k')) OR all='never'`);

// const g_expect = {
// 	type: 'and',
// 	lhs: {
// 		type: 'expr',
// 		key: 'a',
// 		op: '=',
// 		value: 'b',
// 	},
// 	rhs: {
// 		type: 'or',
// 		lhs: {
// 			type: 'expr',
// 			key: 'c',
// 			op: '=',
// 			value: 'd',
// 		},
// 		rhs: {
// 			type: 'and',
// 			lhs: {
// 				type: 'expr',
// 				key: 'e',
// 				op: '=',
// 				value: 'f',
// 			},
// 			rhs: {
// 				type: 'expr',
// 				key: 'g',
// 				op: '=',
// 				value: 'h',
// 			},
// 		},
// 	},
// };


// /*

// wasm.thing matches /yellow|orange|grey/

// */
