import { useSyncExternalStore } from 'react';

interface GradeFeedback {
  nodeId: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  retryGrade: (() => Promise<void>) | undefined;
}

const emptyFeedback: GradeFeedback = {
  nodeId: null,
  errorMessage: null,
  isSubmitting: false,
  retryGrade: undefined
};
let feedback = emptyFeedback;
let pending = false;
const listeners = new Set<() => void>();

function publish(next: GradeFeedback) {
  feedback = next;
  listeners.forEach((listener) => listener());
}

export function resetReviewGradeFeedback() {
  publish(emptyFeedback);
}

export async function submitReviewGradeFeedback(nodeId: string | null, save: () => Promise<boolean>) {
  if (!nodeId || pending) return;
  pending = true;
  const previous = feedback.nodeId === nodeId ? feedback : emptyFeedback;
  const attempt: GradeFeedback = { ...previous, nodeId, isSubmitting: true };
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
    errorMessage: 'Failed to save grade. Please retry.',
    isSubmitting: false,
    retryGrade: () => submitReviewGradeFeedback(nodeId, save)
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReviewGradeFeedbackState(nodeId: string | null) {
  const state = useSyncExternalStore(subscribe, () => feedback, () => emptyFeedback);
  return state.nodeId === nodeId ? state : emptyFeedback;
}
