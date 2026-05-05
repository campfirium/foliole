import type { Node } from '../../nodes/model/nodeTypes';
import { hasNodeReveal } from '../../nodes/model/nodeTypes';

export type ReviewItemKind = 'none' | 'reading' | 'fsrs';

function resolveFormalReviewItemKind(kind: Node['kind'] | null | undefined): ReviewItemKind | null {
  if (kind === 'folder') {
    return 'none';
  }
  if (kind === 'topic') {
    return 'reading';
  }
  if (kind === 'item') {
    return 'fsrs';
  }
  return null;
}

export function getReviewItemKind(node: Node | null | undefined): ReviewItemKind {
  if (!node) {
    return 'none';
  }
  const formalReviewItemKind = resolveFormalReviewItemKind(node.kind);
  if (formalReviewItemKind) {
    return formalReviewItemKind;
  }
  if (node.review) {
    return 'fsrs';
  }
  if (node.anchorLink?.kind === 'cloze') {
    return 'fsrs';
  }
  if (hasNodeReveal(node)) {
    return 'fsrs';
  }
  return 'reading';
}

export function isFsrsReviewItemNode(node: Node | null | undefined) {
  return getReviewItemKind(node) === 'fsrs';
}

export function isReadingReviewItemNode(node: Node | null | undefined) {
  return getReviewItemKind(node) === 'reading';
}
