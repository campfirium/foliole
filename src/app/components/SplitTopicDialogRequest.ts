export const SPLIT_TOPIC_DIALOG_REQUEST_EVENT = 'foliole:split-topic-dialog-request';

export interface SplitTopicDialogRequest {
  sourceNodeId: string;
}

export function requestSplitTopicDialog(sourceNodeId: string) {
  window.dispatchEvent(new CustomEvent<SplitTopicDialogRequest>(SPLIT_TOPIC_DIALOG_REQUEST_EVENT, {
    detail: { sourceNodeId }
  }));
}

export function readSplitTopicDialogRequest(event: Event): SplitTopicDialogRequest | null {
  if (!(event instanceof CustomEvent) || typeof event.detail?.sourceNodeId !== 'string') {
    return null;
  }
  return { sourceNodeId: event.detail.sourceNodeId };
}
