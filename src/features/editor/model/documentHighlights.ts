import { extractAnchorBlocks, stripAnchorBlocks } from './anchorBlocks';

export interface DocumentHighlightItem {
  id: string;
  text: string;
}

function normalizeHighlightText(content: string) {
  return stripAnchorBlocks(content).replace(/\s+/g, ' ').trim();
}

export function collectDocumentHighlights(content: string): DocumentHighlightItem[] {
  return extractAnchorBlocks(content)
    .filter((block) => block.kind === 'highlight')
    .map((block) => ({
      id: block.id,
      text: normalizeHighlightText(content.slice(block.contentFrom, block.contentTo))
    }))
    .filter((item) => item.text.length > 0);
}
