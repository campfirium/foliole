import type { ReadingState } from '../review/readingState.js';

export interface NodeLearningSummary {
  reading: { state: ReadingState; repetitionCount: number } | null;
  review: { lastReviewAt: string | null } | null;
}

type LearningNode = {
  reading?: NodeLearningSummary['reading'];
  review?: NodeLearningSummary['review'];
  learningSummary?: NodeLearningSummary;
};

export function nodeReadingSummary(node: LearningNode | null | undefined) {
  return node?.reading !== undefined ? node.reading : node?.learningSummary?.reading ?? null;
}

export function nodeReviewSummary(node: LearningNode | null | undefined) {
  return node?.review !== undefined ? node.review : node?.learningSummary?.review ?? null;
}

export function projectNodeLearningSummary<T extends LearningNode>(node: T): Omit<T, 'reading' | 'review'> {
  if (node.reading === undefined && node.review === undefined && node.learningSummary) return node;
  const projected = { ...node, learningSummary: {
    reading: nodeReadingSummary(node) ? { state: nodeReadingSummary(node)!.state,
      repetitionCount: nodeReadingSummary(node)!.repetitionCount } : null,
    review: nodeReviewSummary(node) ? { lastReviewAt: nodeReviewSummary(node)!.lastReviewAt } : null
  } };
  delete projected.reading;
  delete projected.review;
  return projected;
}

export function sameNodeReadingSummary(left: LearningNode | undefined, right: LearningNode | undefined) {
  const a = nodeReadingSummary(left), b = nodeReadingSummary(right);
  return a && b ? a.state === b.state && a.repetitionCount === b.repetitionCount : a === b;
}

export function sameNodeReviewSummary(left: LearningNode | undefined, right: LearningNode | undefined) {
  const a = nodeReviewSummary(left), b = nodeReviewSummary(right);
  return a && b ? a.lastReviewAt === b.lastReviewAt : a === b;
}
