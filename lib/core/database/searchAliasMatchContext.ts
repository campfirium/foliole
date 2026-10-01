import { findSearchAliasSpans, prepareSearchAliasText } from './searchAliasEvidence.js';

// A plan owns its temporary text evidence. Nothing survives the query plan.
const contexts = new WeakMap<object, Map<string, ReturnType<typeof prepareSearchAliasText>>>();

function preparedText(owner: object, text: string) {
  let context = contexts.get(owner);
  if (!context) {
    context = new Map();
    contexts.set(owner, context);
  }
  let prepared = context.get(text);
  if (!prepared) {
    prepared = prepareSearchAliasText(text);
    context.set(text, prepared);
  }
  return prepared;
}

export function matchesSearchAliasTerm(owner: object, text: string, spelling: string) {
  return preparedText(owner, text)(spelling).length > 0;
}

export function locateSearchAliasSpans(owner: object | undefined, text: string, spellings: string[]) {
  if (spellings.length === 0) return [];
  return findSearchAliasSpans(text, spellings, owner ? preparedText(owner, text) : undefined);
}
