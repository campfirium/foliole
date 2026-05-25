import type { RawBookNode } from './epubImportTree.js';

const EMPTY_SECTION_RATIO_THRESHOLD = 0.5;
const MIN_HEALTH_SECTION_COUNT = 4;
const CONTENT_CONCENTRATION_THRESHOLD = 0.8;

function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  return current ? `${current}; ${next}` : next;
}

function contentLength(node: RawBookNode) {
  return node.content.trim().length;
}

export function diagnoseEpubImportHealth(nodes: RawBookNode[]) {
  if (nodes.length < MIN_HEALTH_SECTION_COUNT) {
    return null;
  }

  const lengths = nodes.map(contentLength);
  const emptyCount = lengths.filter((length) => length === 0).length;
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const maxLength = Math.max(...lengths);
  let reason: string | null = null;

  if (emptyCount / nodes.length >= EMPTY_SECTION_RATIO_THRESHOLD) {
    reason = appendReason(reason, `EPUB import health degraded: ${emptyCount}/${nodes.length} sections are empty`);
  }
  if (totalLength > 0 && maxLength / totalLength >= CONTENT_CONCENTRATION_THRESHOLD) {
    reason = appendReason(reason, 'EPUB import health degraded: content is concentrated in one section');
  }
  return reason;
}
