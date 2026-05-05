import type { ImportHighlightPolicy } from './contract.js';

const IMPORTED_HIGHLIGHT_PATTERN = /==(.+?)==/g;

export interface ImportedInlineHighlight {
  content: string;
  label: null;
}

export function applyImportHighlightPolicy(content: string, policy: ImportHighlightPolicy) {
  if (policy === 'reference_only') {
    return {
      content,
      highlights: [] satisfies ImportedInlineHighlight[]
    };
  }

  const highlights: ImportedInlineHighlight[] = [];
  const nextContent = content.replace(IMPORTED_HIGHLIGHT_PATTERN, (_match, highlightedText: string) => {
    const normalized = highlightedText.trim();
    if (!normalized) {
      return highlightedText;
    }
    highlights.push({ content: normalized, label: null });
    return normalized;
  });

  return {
    content: nextContent,
    highlights
  };
}
