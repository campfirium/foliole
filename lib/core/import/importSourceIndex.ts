import type { ImportManagerSourceDraft } from './importManagerSettings.js';

export function createNextImportSourceIndex(sources: ImportManagerSourceDraft[], fallback = 101) {
  return sources.reduce((maxIndex, source) => {
    const match = source.id.match(/(\d+)$/);
    if (!match) return maxIndex;
    return Math.max(maxIndex, Number(match[1]));
  }, fallback - 1) + 1;
}
