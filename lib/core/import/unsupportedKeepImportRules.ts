import type { ImportManagerSourceDraft } from './importManagerSettings.js';

export const GENERIC_SPLIT_UNSUPPORTED_MESSAGE = 'Generic split highlights are not available yet.';

export function isGenericSplitImportSourceUnsupported(source: ImportManagerSourceDraft) {
  return source.kind === undefined && source.highlightMode === 'split';
}
