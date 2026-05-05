import { hasInlineAnchorMarkup } from './anchorBlocks.js';
import { findAnchorRecord, unwrapAnchorRecord } from './anchorRecords.js';

export function removeInlineAnchorMarkup(content: string, anchor: { id: string; kind: 'highlight' | 'cloze' }) {
  if (!hasInlineAnchorMarkup(content)) {
    return content;
  }
  const record = findAnchorRecord(content, anchor);
  if (!record) {
    return content;
  }
  return unwrapAnchorRecord(content, record);
}
