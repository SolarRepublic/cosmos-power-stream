import type {U} from 'ts-toolbelt';

import type {JsonObject, ValuesOf} from '@blake.regalia/belt';

import {array, bytes_to_text, escape_regex, stringify_json, text_to_bytes} from '@blake.regalia/belt';
import {sha256} from '@noble/hashes/sha256';

import {NL_MAX_VALUE_TEXT} from './config';

const R_EXPR_HEAD = /\s*([\w.:*-]{1,512}|`[^\n`]{1,512}`)(?:\s*(?:\s+((?:not\s+)?(?:exists))\b|(?:([><!]?=|[><])\s*|\s+((?:not\s+)?(?:includes|like|in))\s+)([-+]?\d+[\w\d_/]*|['"`(])))/y;
const R_EXPR_VALUE_IRK = /([^\\']+|\\[^])*'/y;
const R_EXPR_VALUE_DIRK = /([^\\"]+|\\[^])*"/y;
const R_EXPR_VALUE_TICK = /([^\\`]+|\\[^])*`/y;

const R_EXPR_GROUP_ENTER = /\s*\(/y;
const R_EXPR_GROUP_EXIT = /\s*\)/y;
const R_EXPR_CONTINUATION = /\s+(AND|OR|&&|\|\|)\s+/iy;

const R_EXPR_QUANTITY = /[-+]?\d+[\w\d_/]*/y;

const R_WS_SEPARATOR = /\s*,?\s*/y;

const RT_QUOTE = /^['"`]/;
const RT_EXPR_AND = /^\s+(AND|&&)\s+/i;

export const R_BIGINTISH = /^([-+]?\d{1,78})([a-z\d_]{1,16}|ibc\/[A-F0-9]{64}|factory\/\S{,120})?$/;

const A_OPERATORS_UNARY = ['exists', 'not exists'] as const;
const A_OPERATORS_INEQUALITY = ['>', '<', '>=', '<='] as const;
const A_OPERATORS_EQUALITY = ['!=', '='] as const;
const A_OPERATORS_SEMANTIC = ['includes', 'like', 'in', 'not includes', 'not like', 'not in'] as const;

type QueryExprOperatorUnary = ValuesOf<typeof A_OPERATORS_UNARY>;
type QueryExprOperatorInquality = ValuesOf<typeof A_OPERATORS_INEQUALITY>;
type QueryExprOperatorEquality = ValuesOf<typeof A_OPERATORS_EQUALITY>;
type QueryExprOperatorSemantic = ValuesOf<typeof A_OPERATORS_SEMANTIC>;

type QueryExprOperatorSymbol = QueryExprOperatorInquality | QueryExprOperatorEquality;
type QueryExprOperatorBinary = QueryExprOperatorSymbol | QueryExprOperatorSemantic;

type QueryExprOperator = QueryExprOperatorUnary | QueryExprOperatorBinary;

type AstNodeCondition<s_type extends 'and' | 'or'> = {
	id: number;
	type: s_type;
	lhs: AstNode;
	rhs: AstNode;
};

type AstNodeConditionAny = AstNodeCondition<'and'> | AstNodeCondition<'or'>;

type AstNodeExpr = {
	id: number;
	type: 'expr';
	key: string;
	op: QueryExprOperator;
	value: string | string[] | undefined;
};

export type AstNode = AstNodeConditionAny | AstNodeExpr;

const H_VALUE_EXTRACTORS = {
	"'": R_EXPR_VALUE_IRK,
	'"': R_EXPR_VALUE_DIRK,
	'`': R_EXPR_VALUE_TICK,
};

const H_OPERATOR_ALIASES: Record<QueryExprOperatorSymbol, string> = {
	'<': 'lt',
	'>': 'gt',
	'<=': 'lte',
	'>=': 'gte',
	'!=': 'neq',
	'=': 'eq',
};

export type QueryFunction = (h_events: Dict<String[]>, g_scope: {R_BIGINTISH: RegExp}) => boolean;

class ParsingError extends Error {
	constructor(s_msg: string, i_position: number, s_query?: string) {
		super(`Parsing error: ${s_msg}\n${s_query}\n${' '.repeat(i_position)}^`);
	}
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
const escape_sql_identifier = (s: string) => '"'+s.replace(/"/g, '""')+'"';

/**
 * Represents a parsed event query, used to filter events in real-time as well as to query cached events from the database
 */
export class EventQuery {
	/**
	 * Parses an event query. The grammar is documented here using EBNF:
	 * ```
	 * query = groups { ("AND" | "OR" | "&&" | "||") groups } ;
	 * groups = "(" query ")" | expr ;
	 * expr = path ( operator value | unary );
	 * unary = "exists" | "not exists" ;
	 * path = pattern { "." path } | "`" .* "`";
	 * pattern = IDENTIFIER { ("." | "*") pattern }
	 * operator = "<" | ">" | "<=" | ">=" | "!=" | "=" | "includes" | "like" | "in" ;
	 * value = quantity | string | set
	 * quantity = ["-" | "+"] DIGITS [UNITS]
	 * string = ('"' .* '"") | ("'" .* "'") | ("`" .* "`")
	 * set = "(" { (quantity | string) [","] } ")"
	 * ```
	 * 
	 * ## Examples:
	 * ```
	 * tx.height > 100 AND tx.height < 500
	 * 
	 * transfer.amount > 5000000uscrt AND message.sender in ("...", "...")
	 * 
	 * message.module = 'compute' AND wasm.
	 * ```
	 * 
	 * @param s_query 
	 * @returns 
	 */
	static parse(s_query: string): EventQuery {
		// trim
		s_query = s_query.trim();

		// set match index to beginning of query
		let i_match = 0;

		// persist stack across groups levels
		const a_stack: [AstNodeConditionAny | null, AstNode | null][] = [];

		// current node and condition
		let g_node!: AstNode;
		let g_condition: AstNodeConditionAny | null = null;

		// ref to the top node
		let g_top: AstNode | null = null;

		let c_nodes = 0;

		// reusable token exec result
		let m_token!: RegExpExecArray | null;

		// attempts to match the given token, advancing the pointer on success
		const match = (r_token: RegExp): RegExpExecArray | null => {
			// set location for execution
			r_token.lastIndex = i_match;

			// attempt match, storing to local field
			if((m_token=r_token.exec(s_query))) {  // eslint-disable-line @typescript-eslint/no-extra-parens
				// update position
				i_match = r_token.lastIndex;
			}

			// return result
			return m_token;
		};

		// enters a group
		const enter = () => {
			console.log(`ENTER -> push(${g_condition? `#${g_condition.id}`: null}); cond=null`);

			// push condition to stack
			a_stack.push([g_condition, g_top]);

			// reset condition and top
			g_condition = g_top = null;
		};

		// exits a group
		const exit = () => {
			// pop condition from stack
			[g_condition, g_top] = a_stack.pop()!;

			console.log(`EXIT -> cond=pop()=${g_condition? `#${g_condition.id}`: null}`);

			// condition is not null
			if(g_condition) {
				console.log(`  ^--> #${g_condition.id}.rhs=#${g_node.id}; node=#${g_condition.id}`);

				// set rhs of condition to current node
				g_condition.rhs = g_node;

				// adjust node
				g_node = g_top || g_condition;
			}
		};

		// consumes a string token from the input and returns its contents
		const eat_string = (s_quote: string): string => {
			// lookup regex associated with string delimiter
			const r_expr_value = H_VALUE_EXTRACTORS[s_quote as keyof typeof H_VALUE_EXTRACTORS];

			// no match
			if(!match(r_expr_value)) throw new ParsingError(`While parsing value`, i_match, s_query);

			// destructure match
			const [s_value_tail] = m_token!;

			// unescape and remove trailing delimiter
			return s_value_tail.slice(0, -1).replace(/\\([^])/g, '$1');
		};

		// while there are characters left to parse
		for(; i_match<s_query.length;) {
			// entering a group
			if(match(R_EXPR_GROUP_ENTER)) {
				// enter group
				enter();

				// restart
				continue;
			}

			// expression
			if(!match(R_EXPR_HEAD)) throw new ParsingError('Invalid query', i_match, s_query);

			// destructure expression
			const [, s_key, s_unary, s_bin_op, s_bin_sem, s_value_head] = m_token!;

			// prep operator and value
			let s_op!: QueryExprOperator;
			let w_value: string | string[] | undefined;

			// unary
			if(s_unary) {
				s_op = s_unary.trim().replace(/\s+/g, ' ').toLowerCase() as QueryExprOperatorUnary;
			}
			// binary
			else {
				// remove whitespace from operator
				s_op = (s_bin_op || s_bin_sem).trim() as QueryExprOperatorBinary;

				// quote character
				if(RT_QUOTE.test(s_value_head)) {
					// consume string
					w_value = eat_string(s_value_head);

					// inequality operator being used; assert valid quantity
					if(A_OPERATORS_INEQUALITY.includes(s_op as QueryExprOperatorInquality)) {
						// quantity is invalid
						if(!R_BIGINTISH.test(w_value)) {
							throw Error(`Type error: invalid quantity for inequality operation "${w_value}"`);
						}
					}
				}
				// set
				else if('(' === s_value_head[0]) {
					// only allowed for the `in` operator
					if('in' !== s_op && 'not in' !== s_op) throw new ParsingError('Sets are only allowed when using the "in" or "not in" operators', i_match, s_query);

					// collect set of values
					const as_values = new Set<string>();
					EATING_SET_ITEMS: {
						// parse each value
						for(; i_match<s_query.length;) {
							// leading part of query
							const s_lead = s_query.slice(i_match);

							// quote character; string
							if(RT_QUOTE.test(s_lead)) {
								// advance index past quote
								i_match += 1;

								// add to list
								as_values.add(eat_string(s_lead[0]));
							}
							// quantity
							else if(match(R_EXPR_QUANTITY)) {
								// extract from exec result
								const [s_quantity] = m_token!;

								// add to list
								as_values.add(s_quantity);
							}
							// terminated list
							else if(')' === s_lead[0]) {
								break EATING_SET_ITEMS;
							}
							// invalid token
							else {
								throw new ParsingError(`Invalid token inside of set`, i_match, s_query);
							}

							// skip separator and whitespace
							match(R_WS_SEPARATOR);
						}

						// EOF
						throw new ParsingError(`Expected set closing paren ")"`, i_match, s_query);
					}

					// convert set to array and save to value
					w_value = array(as_values);
				}
				// quantity; set value
				else if(R_BIGINTISH.test(s_value_head)) {
					w_value = s_value_head;
				}
				// invalid
				else {
					throw new ParsingError(`Invalid value`, i_match, s_query);
				}
			}

			// set node expression
			g_node = {
				id: ++c_nodes,
				type: 'expr',
				key: s_key.replace(/^`([^`]*)$`/, '$1'),
				op: s_op,
				value: w_value,
			};

			console.log(`#${g_node.id} node=${s_key}${/\w/.test(s_op)? ` ${s_op}`: s_op}${w_value ?? ''}`);

			// peek ahead; anything other than AND
			if(g_condition && !RT_EXPR_AND.test(s_query.slice(i_match))) {
				console.log(`PEEK -> #${g_condition.id}.rhs=#${g_node.id}; node=#${g_condition.id}`);

				// set rhs of condition
				g_condition.rhs = g_node;

				// set node
				g_node = g_condition;
			}

			// consume exit groups
			for(;;) {
				// match token
				if(match(R_EXPR_GROUP_EXIT)) {
					// no group to exit
					if(!a_stack.length) throw new ParsingError('Extraneous closing paren', i_match, s_query);

					// exit group
					exit();

					// repeat
					continue;
				}

				// done exitting groups
				break;
			}

			// continuation
			if(match(R_EXPR_CONTINUATION)) {
				// destructure continuation
				const [, s_keyword] = m_token!;

				// normalize condition type
				const s_condition = s_keyword.toLowerCase()
					.replace('&&', 'and')
					.replace('||', 'or') as AstNodeConditionAny['type'];

				// prepare new condition (claim preceding node)
				const g_condition_new = {
					id: ++c_nodes,
					type: s_condition,
					lhs: 'or' === s_condition? g_top || g_node: g_node,
				} as AstNodeConditionAny;

				console.log(`#${g_condition_new.id} cond=<${s_condition.toUpperCase()} #${g_condition_new.lhs.id}>`);

				// AND
				if('and' === s_condition) {
					// follows previous condition
					if(g_condition) {
						// already has rhs; wrap
						if(g_condition.rhs) {
							g_condition_new.lhs = g_condition.rhs;
						}

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
			// nothing
			else {
				// nullify condition
				g_condition = null;

				// done
				break;
			}
		}

		// did not consume everything
		if(i_match !== s_query.length) {
			throw new ParsingError('Expected continuation', i_match, s_query);
		}

		// unfinished condition
		if(g_condition) {
			throw new ParsingError('Unterminated condition', i_match, s_query);
		}

		// create instance
		return new EventQuery(g_top || g_condition || g_node, s_query);
	}

	private constructor(protected _g_ast: AstNode, protected _s_query: string) {
	}

	get string(): string {
		return this._s_query;
	}

	toJs(): string {
		const {_g_ast} = this;

		let b_parse_quantities = false;

		return walk<string>(_g_ast, {
			and(g) {
				return `(${this.eval(g.lhs)} && ${this.eval(g.rhs)})`;
			},

			or(g) {
				return `(${this.eval(g.lhs)} || ${this.eval(g.rhs)})`;
			},

			expr(g_expr, a_ancestry) {
				// prep condition code
				let sx_condition = '';

				// ref operator
				const s_op = g_expr.op;

				// accessor
				const sx_accesor = `h_events[${stringify_json(g_expr.key)}]?`;

				// equals
				if('=' === s_op) {
					sx_condition = `${sx_accesor}.includes(${stringify_json(g_expr.value)})`;
				}
				// exists
				else if('exists' === s_op) {
					sx_condition = `!!${sx_accesor}.length`;
				}
				// quantity
				else if(A_OPERATORS_INEQUALITY.includes(g_expr.op as QueryExprOperatorInquality)) {
					// will need to parse quantities
					b_parse_quantities = true;

					// extract quantity and unit
					const [, s_quantity, s_unit] = R_BIGINTISH.exec(g_expr.value as string)!;

					// TODO: support wildcards in key

					// build code
					sx_condition = `quantities(${stringify_json(g_expr.key)}${s_unit? `, ${stringify_json(s_unit)}`: ''}).some(xg => xg ${g_expr.op} ${BigInt(s_quantity)}n)`;
				}
				// includes
				else if('includes' === s_op) {
					sx_condition = `${sx_accesor}.some(s => s.includes(${stringify_json(g_expr.value)}))`;
				}
				// like
				else if('like' === s_op) {
					// only allow _ and % wildcards
					const sx_pattern = escape_regex(g_expr.value as string).replace(/%/g, '.*').replace(/_/g, '.');
					sx_condition = `${sx_accesor}.some(s => /^${sx_pattern}$/.test(s))`;
				}
				// in
				else if('in' === s_op) {
					sx_condition = `${sx_accesor}.some(s => ${stringify_json(g_expr.value as string[])}.includes(s))`;
				}
				// not equals
				else if('!=' === s_op) {
					sx_condition = `${sx_accesor}.some(s => ${stringify_json(g_expr.value)} !== s)`;
				}
				// not exists
				else if('not exists' === s_op) {
					sx_condition = `!${sx_accesor}.length`;
				}
				// unhandled
				else {
					throw Error(`Unsupported operand "${s_op}"`);
				}

				debugger;

				return sx_condition;
			},
		}).output;
	}

	toFunction(): QueryFunction {
		const sx_source = `
			// cache of quantities
			const h_quantity_cache = Object.create(null);

			// memoizing quantity fetcher
			const quantities = (s_path, s_unit='') => {
				return h_quantity_cache[s_path+'\\n'+s_unit] ??= h_events[s_path]?.reduce((a_out, s_value) => {
					const m_bigint = g_scope.R_BIGINTISH.exec(s_value);

					if(m_bigint && s_unit === (m_bigint[2] || '')) {
						a_out.push(BigInt(m_bigint[1]));
					}

					return a_out;
				}, []) || [];
			};

			return ${this.toJs()};
		`;

		// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
		return new Function('h_events', 'g_scope', sx_source) as (h_events: Dict<String[]>) => boolean;

		// const h_events: Dict<string[]> = {};
			// // cache of quantities
			// const h_quantity_cache: Dict<bigint[]> = Object.create(null);

			// // memoizing quantity fetcher
			// const quantities = (s_path: string, s_unit: string=''): bigint[] => {
			// 	return h_quantity_cache[s_path+'\n'+s_unit] ??= h_events[s_path]?.reduce((a_out, s_value) => {
			// 		const m_bigint = R_BIGINTISH.exec(s_value);

			// 		if(m_bigint && s_unit === (m_bigint[2] || '')) {
			// 			a_out.push(BigInt(m_bigint[1]));
			// 		}

			// 		return a_out;
			// 	}, [] as bigint[]) || [];
			// };

		// const b_eval
		// 	= quantities('tx.height').some(x => x > 500n);
	}

	toSql(): WalkResult<string> {
		const {_g_ast} = this;

		const a_joins: string[] = [];
		const a_wheres: string[] = [];

		const {
			output: sx_body,
			values: a_values,
		} = walk<string>(_g_ast, {
			and(g) {
				return `(${this.eval(g.lhs)} AND ${this.eval(g.rhs)})`;
			},

			or(g) {
				return `(${this.eval(g.lhs)} OR ${this.eval(g.rhs)})`;
			},

			expr(g_expr, a_ancestry) {
				// destructure expression
				const {
					id: n_id,
					op: s_op,
					value: z_value,
					key: s_key,
				} = g_expr;

				// value part of the condition
				let sx_value = '';

				// or, the entire condition
				let sx_condition = '';

				// whether the operation is being negated
				let b_not = false;

				// unary
				if(A_OPERATORS_UNARY.includes(s_op as QueryExprOperatorUnary)) {
					// existential condition
					sx_condition = `filter_event_path_exists(${this.param(s_key)}, '')`;

					// exists
					if('exists' === s_op) {
						// no-op
					}
					// not exists
					else if('not exists' === s_op) {
						// invert match
						b_not = true;
					}
					// other
					else {
						throw Error(`Unsupported unary operator "${s_op}"`);
					}

					// sx_condition = `p.path_text=${this.param(s_key)} AND ${sx_value}`;

					// sx_value = ``;
				}
				// equality
				else if(A_OPERATORS_EQUALITY.includes(s_op as QueryExprOperatorEquality)) {
					// // use value text by default
					// let si_field = 'value_text';
					// let s_arg = z_value as string;

					// // too long; use hash instead
					// if(s_arg.length > NL_MAX_VALUE_TEXT) {
					// 	si_field = 'value_hash';
					// 	s_arg = bytes_to_text(sha256(text_to_bytes(s_arg)));
					// }

					// // create condition
					// sx_value = `v.${si_field} ${s_op} ${this.param(s_arg)}`;

					let s_method = 'text';
					let s_arg = z_value as string;

					// too long; use hash instead
					if(s_arg.length > NL_MAX_VALUE_TEXT) {
						s_method = 'hash';
						s_arg = bytes_to_text(sha256(text_to_bytes(s_arg)));
					}

					const sx_method = escape_sql_identifier(`filter_event_${s_method}_${H_OPERATOR_ALIASES[g_expr.op as QueryExprOperatorSymbol]}`);
					sx_condition = `${sx_method}(${[
						this.param(s_key),
						this.param(s_arg),
					].join(',')})`
				}
				// inequality (quantity)
				else if(A_OPERATORS_INEQUALITY.includes(s_op as QueryExprOperatorInquality)) {
					// extract quantity and units
					const [, s_quantity, s_units] = R_BIGINTISH.exec(z_value as string)!;

					// // root node
					// if(!a_ancestry.length) {
					const sx_method = escape_sql_identifier(`filter_event_quantity_${H_OPERATOR_ALIASES[g_expr.op as QueryExprOperatorSymbol]}`);
					sx_condition = `${sx_method}(${[
						this.param(s_key),
						`CAST(${this.param(s_quantity)} AS DECIMAL)`,
						`${this.param(s_units || null)}`,
					].join(',')})`;
					// }
					// // child ast node
					// else {
					// 	sx_value = [
					// 		`v.value_bigint ${s_op} CAST(${this.param(s_quantity)} AS DECIMAL)`,
					// 		`v.value_unit ${s_units? `= ${this.param(s_units)}`: 'IS NULL'}`,
					// 	].join(' AND ');
					// }
				}
				else {
					debugger;
				}
				// // long string
				// else if(g_expr.value.length) {

				// }

				// // fallback to using condition
				// sx_condition ||= `p.path_text=${this.param(s_key)} AND ${sx_value}`;

				// default join type to left
				let s_join_type = 'left';

				// check for contiguity from root to leaf node
				CONTIGUOUS:
				if(!b_not) {
					// each node in ancestry
					for(const g_node of a_ancestry) {
						// anything other than an AND type; not contiguous
						if('and' !== g_node.type) break CONTIGUOUS;
					}

					// contiguous; inner join
					s_join_type = 'inner';
				}

				// create join
				a_joins.push(`${s_join_type} join ${sx_condition} x${n_id} on x${n_id}.tx_id = t.id`);

				// add condition (inverse in case of 'not')
				return `x${n_id}.tx_id IS ${b_not? '': 'NOT'} NULL`;
			},
		});

		return {
			output: `select distinct t.* from transactions t\n${a_joins.map(s => s+'\n').join('')}where ${sx_body} order by t.id asc`,
			values: a_values,
		};
	}

	export(): JsonObject {
		return walk<JsonObject>(this._g_ast, {
			and(g) {
				return {
					type: 'and',
					lhs: this.eval(g.lhs),
					rhs: this.eval(g.rhs),
				};
			},

			or(g) {
				return {
					type: 'or',
					lhs: this.eval(g.lhs),
					rhs: this.eval(g.rhs),
				};
			},

			expr(g) {
				const g_clone: JsonObject = {...g};
				delete (g_clone as any).id;
				return g_clone;
			},
		}).output;
	}
}

type Walker<w_return> = {
	eval(g_ast: AstNode): w_return;
	param(s_value: string | null): `$${number}`;
};

type AstRouter<w_return> = {
	[s_type in AstNode['type']]: (
		this: Walker<w_return>,
		g_node: U.Select<AstNode, {type: s_type}>,
		a_ancestry: AstNode[],
	) => w_return;
};

type WalkResult<w_return> = {
	output: w_return;
	values: (string | null)[];
};

export function walk<w_return>(
	g_ast: AstNode,
	h_router: AstRouter<w_return>,
	a_ancestry: AstNode[]=[]
): WalkResult<w_return> {
	// initialize values
	const a_values: (string | null)[] = [];

	// create walker object
	const k_walker: Walker<w_return> = {
		// recurses on the given node
		eval: g_node => h_router[g_node.type as 'expr'].call(k_walker, g_node as AstNodeExpr, [...a_ancestry, g_ast]),

		// adds a param value to the list and returns its param identifier
		param: s_value => `$${a_values.push(s_value)}`,
	};

	// function backfill(this: Walker<w_return>, g: AstNodeConditionAny) {
	// 	this.eval(g.lhs);
	// 	this.eval(g.rhs);
	// }

	// // backfill and/or
	// h_router.and ??= backfill ;
	// h_router.or ??= backfill;

	// call on root node
	return {
		output: h_router[g_ast.type as 'expr'].call(k_walker, g_ast as AstNodeExpr, a_ancestry),
		values: a_values,
	};
}


// const k_query = EventQuery.parse(`tx.height > 1250 AND transfer.amount > 500uscrt OR tx.height = 150`);
// const s_query_preview = k_query.toJs();
// console.log(s_query_preview);

// const f_test = k_query.toFunction();
// console.log(f_test);

// const b_test = f_test({
// 	'tx.height': [
// 		'120',
// 		'1251',
// 	],
// 	'transfer.amount': [
// 		'6000uscrt',
// 	],
// }, {
// 	R_BIGINTISH,
// });
// console.log(b_test);

// debugger;
