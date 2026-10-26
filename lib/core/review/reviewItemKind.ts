import type { WorkspaceNodeSnapshot } from '../database/workspaceSnapshotHelpers.js';
import { hasNodeReveal } from '../nodes/nodeContentFlags.js';

export type ReviewItemKind = 'none' | 'reading' | 'fsrs';
export type ReviewItemNodeLike = Pick<WorkspaceNodeSnapshot, 'kind' | 'review' | 'reveal' | 'hasReveal'> & {
  anchorLink?: { kind: 'highlight' | 'cloze' | 'image-excerpt' } | null;
};

function resolveFormalReviewItemKind(kind: WorkspaceNodeSnapshot['kind'] | null | undefined): ReviewItemKind | null {
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

export function getReviewItemKind(node: ReviewItemNodeLike | null | undefined): ReviewItemKind {
  if (!node) {
    return 'none';
  }
  if (node.anchorLink?.kind === 'image-excerpt') {
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

export function isFsrsReviewItemNode(node: ReviewItemNodeLike | null | undefined) {
  return getReviewItemKind(node) === 'fsrs';
}

export function isReadingReviewItemNode(node: ReviewItemNodeLike | null | undefined) {
  return getReviewItemKind(node) === 'reading';
}
