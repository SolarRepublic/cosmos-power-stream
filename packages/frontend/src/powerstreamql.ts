import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

export const SI_POWERSTREAMQL_LANGUAGE = 'powerstreamql';
export const SI_POWERSTREAMQL_THEME = 'powerstreamql';

const sw = (si_token: string, si_state: string) => ({
	token: si_token,
	switchTo: si_state,
});

export function register_powerstreamql(y_monaco: typeof Monaco) {
	y_monaco.languages.register({
		id: SI_POWERSTREAMQL_LANGUAGE,
	});

	y_monaco.languages.setLanguageConfiguration(SI_POWERSTREAMQL_LANGUAGE, {
		autoClosingPairs: [
			{
				open: '(',
				close: ')',
			},
		],
	});

	y_monaco.editor.defineTheme(SI_POWERSTREAMQL_THEME, {
		base :'vs-dark',
		inherit: true,
		rules: [
			{
				token: 'variable.other',
				foreground: 'F2F1C4',
			},
			{
				token: 'keyword.operator',
				foreground: '9F5ACF',
			},
			{
				token: 'keyword.operator.logical',
				foreground: '8888FF',
			},
			{
				token: 'string',
				foreground: '30B679',
			},
			{
				token: 'constant.numeric.decimal',
				foreground: '5499D2',
			},
			{
				token: 'meta.numeric.unit',
				foreground: '4488BB',
			},
			{
				token: 'punctuation.definition',
				foreground: 'FFCE0C',
			},
			{
				token: 'keyword.operator.access',
				foreground: 'ADE9C6',
			},
			{
				token: 'invalid',
				foreground: 'FF0000',
				// foreground: 'BD5393',
				// background: '7F225A',
			},
			{
				token: 'punctuation.definition.string.wildcard',
				foreground: '89F6F6',
			},
		],
		colors: {},
	});

	y_monaco.languages.setMonarchTokensProvider(SI_POWERSTREAMQL_LANGUAGE, {
		tokenizer: {
			root: [
				[/[\w:-]{1,512}/, sw('variable.other', 'identifier')],
				[/`[^\n`]{1,512}`/, sw('string', 'event')],
				[/\(/, 'punctuation.definition.expression.begin', '@push'],
				{include:'end'},
			],

			identifier: [
				[/[*]/, 'punctuation.definition.string.wildcard'],
				[/[.]/, 'keyword.operator.access'],
				[/[\w:-]{1,512}/, 'variable.other'],
				[/(?=[^])/, sw('meta.none', 'event')],
			],

			event: [
				[/\b((?:not\s+)?(?:exists))\b/, sw('keyword.operator.logical','cont')],
				[/like/, sw('keyword.operator.semantic.like', 'like_value')],
				[/[><!]?=|[><]|includes|in/, sw('keyword.operator.relational', 'like_value')],
				{include:'end'},
			],

			cont: [
				[/AND|OR|and|or|&&|\|\|/, sw('keyword.operator.logical', 'root')],
				[/\)/, 'punctuation.definition.expression.begin', 'cont'],
				{include:'end'},
			],

			like_value: [
				[/'/, sw('string.irk', 'like_irk')],
				[/"/, sw('string.dirk', 'like_dirk')],
				[/`/, sw('string.tick', 'like_tick')],
				[/([-+]?)(\d+)/, sw('constant.numeric.decimal', 'numeric')],
				{include:'end'},
			],

			like_irk: [
				[/([^\\'%.]+|\\[^])+/, 'string.irk'],
				{include: 'like_wildcard'},
				[/'/, sw('string.irk', 'cont')],
			],

			like_dirk: [
				[/([^\\"%.]+|\\[^])+/, 'string.dirk'],
				{include: 'like_wildcard'},
				[/"/, sw('string.dirk', 'cont')],
			],

			like_tick: [
				[/([^\\`%.]+|\\[^])+/, 'string.tick'],
				{include: 'like_wildcard'},
				[/`/, sw('string.tick', 'cont')],
			],

			like_wildcard: [
				[/[.%]/, 'punctuation.definition.string.wildcard'],
			],

			numeric: [
				[/([\w\d_/]*)/, sw('meta.numeric.unit', 'cont')],
				{include:'end'},
			],

			end: [
				[/[ \t\r\n]+/, 'meta.whitespace'],
				[/[^]/, 'invalid'],
			],
		},
	});

	// y_monaco.languages.registerCompletionItemProvider(SI_POWERSTREAMQL_LANGUAGE, {
	// 	provideCompletionItems(y_model, y_pos, g_context, g_token) {
			
	// 	},
	// });
}
