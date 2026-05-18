const SEARCH_OPERATOR_TOKENS = new Set(['AND', 'OR', 'NOT']);
const SEARCH_TERM_EDGE_PUNCTUATION = /^["'()[\]{}.,!?;:，。？！；：（）【】「」『』《》、]+|["'()[\]{}.,!?;:，。？！；：（）【】「」『』《》、]+$/g;
const SEARCH_TOKEN_SEPARATOR_PUNCTUATION = /[，。？！；：、]+/g;
const MIN_TRIGRAM_FTS_TERM_LENGTH = 3;
const MAX_PAIR_QUERIES = 6;

type SearchExpression =
  | { kind: 'and'; left: SearchExpression; right: SearchExpression }
  | { kind: 'not'; left: SearchExpression; right: SearchExpression }
  | { kind: 'or'; left: SearchExpression; right: SearchExpression }
  | { kind: 'term'; value: string };

interface SearchParseState {
  index: number;
  tokens: string[];
}

export interface FtsSearchQueryPlan {
  advancedQuery: string | null;
  ftsTerms: string[];
  highlightQuery: string;
  literalQuery: string;
  normalizedQuery: string;
  pairPhrases: string[];
  pairQueries: string[];
  shortTerms: string[];
  termQuery: string | null;
  queryTokens: string[];
}

function tokenizeSearchQuery(query: string) {
  return query.replace(SEARCH_TOKEN_SEPARATOR_PUNCTUATION, ' ').trim().split(/\s+/).filter(Boolean);
}

function normalizeSearchToken(token: string) {
  return token.trim().replace(/^"+|"+$/g, '').replace(SEARCH_TERM_EDGE_PUNCTUATION, '').toLowerCase();
}

function isSearchOperatorToken(token: string) {
  return SEARCH_OPERATOR_TOKENS.has(token);
}

function isSearchTermToken(token: string) {
  return !isSearchOperatorToken(token);
}

function normalizeSearchPhrase(tokens: string[]) {
  return tokens.map(normalizeSearchToken).filter(Boolean).join(' ');
}

function normalizeSearchTerms(tokens: string[]) {
  return tokens.map(normalizeSearchToken).filter(Boolean);
}

function normalizeFtsSearchTerms(tokens: string[]) {
  return normalizeSearchTerms(tokens).filter((term) => term.length >= MIN_TRIGRAM_FTS_TERM_LENGTH);
}

function normalizeShortSearchTerms(tokens: string[]) {
  return normalizeSearchTerms(tokens).filter((term) => term.length > 0 && term.length < MIN_TRIGRAM_FTS_TERM_LENGTH);
}

function buildPairPhrases(tokens: string[], advancedQuery: string | null) {
  if (advancedQuery) {
    return [];
  }
  const terms = normalizeSearchTerms(tokens);
  return terms.slice(0, MAX_PAIR_QUERIES + 1).flatMap((term, index) => {
    const nextTerm = terms[index + 1];
    return nextTerm ? [`${term} ${nextTerm}`] : [];
  }).slice(0, MAX_PAIR_QUERIES);
}

function escapeFtsPhrase(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function peek(state: SearchParseState) {
  return state.tokens[state.index];
}

function consume(state: SearchParseState) {
  const token = state.tokens[state.index];
  state.index += 1;
  return token;
}

function parsePrimary(state: SearchParseState): SearchExpression | null {
  const token = peek(state);
  if (!token || isSearchOperatorToken(token)) {
    return null;
  }
  const consumed = consume(state);
  if (!consumed) {
    return null;
  }
  const normalizedToken = normalizeSearchToken(consumed);
  return normalizedToken ? { kind: 'term', value: normalizedToken } : null;
}

function parseNot(state: SearchParseState): SearchExpression | null {
  let expression = parsePrimary(state);
  if (!expression) {
    return null;
  }
  while (peek(state) === 'NOT') {
    consume(state);
    const right = parsePrimary(state);
    if (!right) {
      return null;
    }
    expression = { kind: 'not', left: expression, right };
  }
  return expression;
}

function parseAnd(state: SearchParseState): SearchExpression | null {
  let expression = parseNot(state);
  if (!expression) {
    return null;
  }
  while (state.index < state.tokens.length && peek(state) !== 'OR') {
    if (peek(state) === 'AND') {
      consume(state);
    }
    const right = parseNot(state);
    if (!right) {
      return null;
    }
    expression = { kind: 'and', left: expression, right };
  }
  return expression;
}

function parseOr(state: SearchParseState): SearchExpression | null {
  let expression = parseAnd(state);
  if (!expression) {
    return null;
  }
  while (peek(state) === 'OR') {
    consume(state);
    const right = parseAnd(state);
    if (!right) {
      return null;
    }
    expression = { kind: 'or', left: expression, right };
  }
  return expression;
}

function buildSearchExpression(tokens: string[]) {
  const state = { index: 0, tokens };
  const expression = parseOr(state);
  return expression && state.index === tokens.length ? expression : null;
}

function compileSearchExpression(expression: SearchExpression): string {
  if (expression.kind === 'term') {
    return escapeFtsPhrase(expression.value);
  }
  if (expression.kind === 'not') {
    return `${compileSearchExpression(expression.left)} NOT ${compileSearchExpression(expression.right)}`;
  }
  const left = compileSearchExpression(expression.left);
  const right = compileSearchExpression(expression.right);
  return `${left} ${expression.kind.toUpperCase()} ${right}`;
}

function evaluateSearchExpression(expression: SearchExpression, normalizedHaystack: string): boolean {
  if (expression.kind === 'term') {
    return normalizedHaystack.includes(expression.value);
  }
  if (expression.kind === 'not') {
    return evaluateSearchExpression(expression.left, normalizedHaystack) && !evaluateSearchExpression(expression.right, normalizedHaystack);
  }
  if (expression.kind === 'and') {
    return evaluateSearchExpression(expression.left, normalizedHaystack) && evaluateSearchExpression(expression.right, normalizedHaystack);
  }
  return evaluateSearchExpression(expression.left, normalizedHaystack) || evaluateSearchExpression(expression.right, normalizedHaystack);
}

function resolveHighlightQuery(tokens: string[], normalizedQuery: string, advancedQuery: string | null) {
  if (!advancedQuery) {
    return normalizedQuery;
  }
  const firstSearchTerm = tokens.find((token) => isSearchTermToken(token));
  return firstSearchTerm ? normalizeSearchToken(firstSearchTerm) : normalizedQuery;
}

function buildTermQuery(tokens: string[], advancedQuery: string | null) {
  if (advancedQuery) {
    return null;
  }
  const terms = normalizeFtsSearchTerms(tokens);
  if (terms.length <= 1) {
    return null;
  }
  return terms.map(escapeFtsPhrase).join(' AND ');
}

export function buildFtsSearchQueryPlan(query: string): FtsSearchQueryPlan {
  const queryTokens = tokenizeSearchQuery(query);
  const normalizedQuery = normalizeSearchPhrase(queryTokens);
  const expression = queryTokens.some(isSearchOperatorToken) ? buildSearchExpression(queryTokens) : null;
  const advancedQuery = expression ? compileSearchExpression(expression) : null;
  const ftsTerms = advancedQuery ? [] : normalizeFtsSearchTerms(queryTokens);
  const pairPhrases = buildPairPhrases(queryTokens, advancedQuery);
  return {
    advancedQuery,
    ftsTerms,
    highlightQuery: resolveHighlightQuery(queryTokens, normalizedQuery, advancedQuery),
    literalQuery: normalizedQuery ? escapeFtsPhrase(normalizedQuery) : '',
    normalizedQuery,
    pairPhrases,
    pairQueries: pairPhrases.map(escapeFtsPhrase),
    shortTerms: advancedQuery ? [] : normalizeShortSearchTerms(queryTokens),
    termQuery: buildTermQuery(queryTokens, advancedQuery),
    queryTokens
  };
}

export function matchesFtsSearchText(text: string, queryPlan: FtsSearchQueryPlan) {
  if (!queryPlan.normalizedQuery) {
    return false;
  }
  const normalizedHaystack = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalizedHaystack.includes(queryPlan.normalizedQuery)) {
    return true;
  }
  const terms = normalizeSearchTerms(queryPlan.queryTokens);
  if (!queryPlan.advancedQuery && terms.length > 1 && terms.every((term) => normalizedHaystack.includes(term))) {
    return true;
  }
  const expression = queryPlan.advancedQuery ? buildSearchExpression(queryPlan.queryTokens) : null;
  return expression ? evaluateSearchExpression(expression, normalizedHaystack) : false;
}
