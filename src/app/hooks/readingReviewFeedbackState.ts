import { useSyncExternalStore } from 'react';

interface ReadingFeedback {
  nodeId: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  retryReadingAction: (() => Promise<void>) | undefined;
}

const emptyFeedback: ReadingFeedback = {
  nodeId: null,
  errorMessage: null,
  isSubmitting: false,
  retryReadingAction: undefined
};
let feedback = emptyFeedback;
let pending = false;
const listeners = new Set<() => void>();

function publish(next: ReadingFeedback) {
  feedback = next;
  listeners.forEach((listener) => listener());
}

export function resetReadingReviewFeedback() {
  publish(emptyFeedback);
}

export async function submitReadingReviewFeedback(nodeId: string | null, save: () => Promise<boolean>) {
  if (!nodeId || pending) return;
  pending = true;
  const previous = feedback.nodeId === nodeId ? feedback : emptyFeedback;
  const attempt: ReadingFeedback = { ...previous, nodeId, isSubmitting: true };
  publish(attempt);
  let saved = false;
  try {
    saved = await save();
  } catch {
    saved = false;
  } finally {
    pending = false;
  }
  if (feedback !== attempt) return;
  publish(saved ? emptyFeedback : {
    nodeId,
    errorMessage: 'Failed to save. Please retry.',
    isSubmitting: false,
    retryReadingAction: () => submitReadingReviewFeedback(nodeId, save)
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReadingReviewFeedbackState(nodeId: string | null) {
  const state = useSyncExternalStore(subscribe, () => feedback, () => emptyFeedback);
  return state.nodeId === nodeId ? state : emptyFeedback;
}
