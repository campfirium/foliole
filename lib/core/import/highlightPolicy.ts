import type { ImportHighlightPolicy } from './contract.js';

const IMPORTED_HIGHLIGHT_PATTERN = /==(.+?)==/g;
const ANCHOR_TAG_PATTERN = /<(?:highlight|cloze)\s+id="([1-9]\d*)"\s*>/g;

function readNextAnchorId(content: string) {
  let maxAnchorId = 0;
  for (const match of content.matchAll(ANCHOR_TAG_PATTERN)) {
    const anchorId = Number(match[1]);
    if (Number.isInteger(anchorId) && anchorId > maxAnchorId) {
      maxAnchorId = anchorId;
    }
  }
  return maxAnchorId + 1;
}

export function applyImportHighlightPolicy(content: string, policy: ImportHighlightPolicy): string {
  if (policy === 'reference_only') {
    return content;
  }
  let nextAnchorId = readNextAnchorId(content);
  return content.replace(IMPORTED_HIGHLIGHT_PATTERN, (_, highlightedText: string) => {
    const anchorId = String(nextAnchorId);
    nextAnchorId += 1;
    return `<highlight id="${anchorId}">${highlightedText}</highlight id="${anchorId}">`;
  });
}
