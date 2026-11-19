import type { SplitTopicTrace } from '../splitTopicTrace';

export const SPLIT_TOPIC_DIALOG_REQUEST_EVENT = 'foliole:split-topic-dialog-request';

export interface SplitTopicDialogRequest {
  sourceNodeId: string;
  trace?: SplitTopicTrace;
}

export function requestSplitTopicDialog(sourceNodeId: string, trace?: SplitTopicTrace) {
  window.dispatchEvent(new CustomEvent<SplitTopicDialogRequest>(SPLIT_TOPIC_DIALOG_REQUEST_EVENT, {
    detail: { sourceNodeId, ...(trace ? { trace } : {}) }
  }));
}

export function readSplitTopicDialogRequest(event: Event): SplitTopicDialogRequest | null {
  if (!(event instanceof CustomEvent) || typeof event.detail?.sourceNodeId !== 'string') {
    return null;
  }
  const { sourceNodeId, trace } = event.detail;
  return { sourceNodeId, ...(trace ? { trace } : {}) };
}
