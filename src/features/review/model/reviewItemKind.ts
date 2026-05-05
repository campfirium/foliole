import type { Node } from '../../nodes/model/nodeTypes';

export type ReviewItemKind = 'none' | 'reading' | 'fsrs';

export function getReviewItemKind(node: Node | null | undefined): ReviewItemKind {
  if (!node) {
    return 'none';
  }
  if (node.review) {
    return 'fsrs';
  }
  if (node.anchorLink?.kind === 'cloze') {
    return 'fsrs';
  }
  if (node.reveal !== null) {
    return 'fsrs';
  }
  return 'reading';
}
