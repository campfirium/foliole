import { compileCompanionCustomCssCollection } from './companionCustomCssCompiler';
import type { CompanionCustomCssCollection } from './companionCustomCssModel';

export const COMPANION_CUSTOM_CSS_STORAGE_KEY = 'foliole-companion-custom-css-snippets-v1';

export type CompanionCustomCssCacheLoadResult =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { compiled: ReturnType<typeof compileCompanionCustomCssCollection>; kind: 'valid' };

export function loadCompanionCustomCssCache(): CompanionCustomCssCacheLoadResult {
  try {
    const valueJson = window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY);
    if (valueJson === null) return { kind: 'empty' };
    return { compiled: compileCompanionCustomCssCollection(JSON.parse(valueJson)), kind: 'valid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export function saveCompanionCustomCssCache(collection: CompanionCustomCssCollection) {
  window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection));
}

export function removeCompanionCustomCssCache() {
  window.localStorage.removeItem(COMPANION_CUSTOM_CSS_STORAGE_KEY);
}
