const R_EXPR_HEAD = /\s*([\w-.]+|`[^`]+`)(\s*(?:[><!]?=|[><])\s*|\s+(?:includes|matches)\s+)([-+]?\d+[\w\d_/]*|['"`])/iy;
const R_EXPR_VALUE_IRK = /([^\\']+|\\[^])*'/y;
const R_EXPR_VALUE_DIRK = /([^\\"]+|\\[^])*"/y;
const R_EXPR_VALUE_TICK = /([^\\`]+|\\[^])*`/y;

const R_EXPR_GROUP_ENTER = /\s*\(/y;
const R_EXPR_GROUP_EXIT = /\s*\)/y;
const R_EXPR_CONTINUATION = /\s+(AND|OR)\s+/iy;

const RT_EXPR_AND = /^\s+AND\s+/i;

type QueryExprOperator =
	| '>'
	| '<'
	| '>='
	| '<='
	| '!='
	| '='
	| 'includes'
	| 'matches'
	| 'in';

type AstNodeCondition = {
	id: number;
	type: 'and' | 'or';
	lhs: AstNode;
	rhs: AstNode;
};

type AstNodeExpr = {
	id: number;
	type: 'expr';
	key: string;
	op: QueryExprOperator;
	value: bigint | number | string;
};

type AstNode = AstNodeCondition | AstNodeExpr;

const H_VALUE_EXTRACTORS = {
	"'": R_EXPR_VALUE_IRK,
	'"': R_EXPR_VALUE_DIRK,
	'`': R_EXPR_VALUE_TICK,
};

class ParsingError extends Error {
	constructor(s_msg: string, i_position: number, s_query?: string) {
		super(`Parsing error: ${s_msg}\n${s_query}\n${' '.repeat(i_position)}^`);
	}
}

/**
 * Parses an event query. The grammar is documented here using EBNF:
 * 
 * ```
 * query = groups { ("AND" | "OR") groups } ;
 * groups = "(" query ")" | expr ;
 * expr = path operator value ;
 * path = IDENTIFIER { "." path } ;
 * operator = "<" | ">" | "<=" | ">=" | "!=" | "=" | "includes" | "matches" | "in" ;
 * value = quantity | string
 * quantity = ["-" | "+"] DIGITS [UNITS]
 * string = ('"' .* '"") | ("'" .* "'") | ("`" .* "`")
 * ```
 * 
 * @param s_query 
 * @returns 
 */
export function parse_event_query(s_query: string): AstNode {
	// set match index to beginning of query
	let i_match = 0;

	// persist stack across groups levels
	const a_stack: [AstNodeCondition | null, AstNode | null][] = [];

	// current node and condition
	let g_node!: AstNode;
	let g_condition: AstNodeCondition | null = null;

	// ref to the top node
	let g_top: AstNode | null = null;

	let c_nodes = 0;

	const enter = () => {
		console.log(`ENTER -> push(${g_condition? `#${g_condition.id}`: null}); cond=null`);

		// push condition to stack
		a_stack.push([g_condition, g_top]);

		// reset condition and top
		g_condition = g_top = null;
	};

	const exit = () => {
		// pop condition from stack
		[g_condition, g_top] = a_stack.pop()!;

		console.log(`EXIT -> cond=pop()=${g_condition? `#${g_condition.id}`: null}`);

		// condition is not null
		if(g_condition) {
			console.log(`  ^--> #${g_condition.id}.rhs=${g_node.id}; node=${g_condition.id}`);

			// set rhs of condition to current node
			g_condition.rhs = g_node;

			// adjust node
			g_node = g_top || g_condition;
		}
	};

	for(; i_match<s_query.length;) {
		// entering a group
		R_EXPR_GROUP_ENTER.lastIndex = i_match;
		const m_enter = R_EXPR_GROUP_ENTER.exec(s_query);
		if(m_enter) {
			// update match position
			i_match = R_EXPR_GROUP_ENTER.lastIndex;

			// enter group
			enter();

			// restart
			continue;
		}

		// expression
		R_EXPR_HEAD.lastIndex = i_match;
		const m_expr = R_EXPR_HEAD.exec(s_query);

		// invalid query
		if(!m_expr) throw new ParsingError('Invalid query', i_match, s_query);

		// update match position
		i_match = R_EXPR_HEAD.lastIndex;

		// destructure expression
		const [, s_key, s_op_raw, s_value_head] = m_expr;

		// remove whitespace from operator
		const s_op = s_op_raw.trim() as QueryExprOperator;

		// prep value
		let z_value: string | bigint | number;

		// string
		if(/['"`]/.test(s_value_head)) {
			// lookup regex associated with string delimiter
			const r_expr_value = H_VALUE_EXTRACTORS[s_value_head as keyof typeof H_VALUE_EXTRACTORS];

			// set position to start match
			r_expr_value.lastIndex = i_match;

			// execute regex
			const m_value = r_expr_value.exec(s_query);

			// no match
			if(!m_value) throw new ParsingError(`While parsing value for key ${s_key}`, i_match, s_query);

			// update match position
			i_match = r_expr_value.lastIndex;

			// destructure match
			const [s_value_tail] = m_value;

			// unescape and remove trailing delimiter
			const s_value = s_value_tail.slice(0, -1).replace(/\\([^])/g, '$1');

			// set value
			z_value = s_value;

			// debugger;
		}
		// quantity; set value
		else {
			z_value = s_value_head;
		}

		// set node expression
		g_node = {
			id: ++c_nodes,
			type: 'expr',
			key: s_key,
			op: s_op,
			value: z_value,
		};

		console.log(`#${g_node.id} node=${s_key}${s_op}${z_value}`);

		// peek ahead; anything other than AND
		if(g_condition && !RT_EXPR_AND.test(s_query.slice(i_match))) {
			console.log(`PEEK -> #${g_condition.id}.rhs=#${g_node.id}; node=#${g_condition.id}`);

			// set rhs of condition
			g_condition.rhs = g_node;

			// set node
			g_node = g_condition;
		}

		// exit groups
		for(;;) {
			R_EXPR_GROUP_EXIT.lastIndex = i_match;
			const m_exit = R_EXPR_GROUP_EXIT.exec(s_query);
			if(m_exit) {
				// no group to exit
				if(!a_stack.length) throw new ParsingError('Extraneous closing paren', i_match, s_query);

				// update match position
				i_match = R_EXPR_GROUP_EXIT.lastIndex;

				// exit group
				exit();

				// repeat
				continue;
			}

			// done exitting groups
			break;
		}

		// continuation
		R_EXPR_CONTINUATION.lastIndex = i_match;
		const m_cont = R_EXPR_CONTINUATION.exec(s_query);
		if(m_cont) {
			// destructure continuation
			const [, s_keyword] = m_cont;

			// update match position
			i_match = R_EXPR_CONTINUATION.lastIndex;

			// normalize condition type
			const s_condition = s_keyword.toLowerCase() as AstNodeCondition['type'];

			// prepare new condition (claim preceding node)
			const g_condition_new = {
				id: ++c_nodes,
				type: s_condition,
				lhs: 'or' === s_condition? g_top || g_node: g_node,
			} as AstNodeCondition;

			console.log(`#${g_condition_new.id} cond=<${s_condition.toUpperCase()} #${g_condition_new.lhs.id}>`);

			// AND
			if('and' === s_condition) {
				// follows previous condition
				if(g_condition) {
					console.log(`  ^--> #${g_condition.id}.rhs=#${g_condition_new.id}; top=#${g_condition.id}`);

					// set rhs of previous condition
					g_condition.rhs = g_condition_new;
				}
			}
			// OR
			else {
				console.log(`  ^--> top=#${g_condition_new.id}`);

				// set top
				g_top = g_condition_new;
			}

			// set new condition
			g_condition = g_condition_new;
		}
	}

	return g_top || g_condition || g_node;
}

