import type { EditorSelection } from '../adapters/EditorAdapter';

import { parseAnchorBlocks } from './anchorBlocks';

export interface AnchorNavigationTarget {
  id: string;
  kind: 'highlight' | 'cloze';
}

export function findAnchorSelection(content: string, anchor: AnchorNavigationTarget): EditorSelection | null {
  const matchedBlock = parseAnchorBlocks(content).blocks.find((block) => block.id === anchor.id && block.kind === anchor.kind);
  if (!matchedBlock) {
    return null;
  }
  return {
    from: matchedBlock.contentFrom,
    to: matchedBlock.contentTo
  };
}
