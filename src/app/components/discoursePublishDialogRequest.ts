import type { NativeDiscoursePublishCatalog } from '../../../lib/platform/nativeDiscoursePublishContract';

export const DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT = 'foliole:discourse-publish-dialog-request';

export interface DiscoursePublishDialogRequest {
  catalog?: NativeDiscoursePublishCatalog;
  content: string;
  nodeId: string;
  targetSiteUrl?: string;
  title: string;
}

export function requestDiscoursePublishDialog(request: DiscoursePublishDialogRequest) {
  window.dispatchEvent(new CustomEvent(DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT, { detail: request }));
}

export function readDiscoursePublishDialogRequest(event: Event): DiscoursePublishDialogRequest | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  const detail = event.detail as Partial<DiscoursePublishDialogRequest>;
  if (typeof detail.content !== 'string' || typeof detail.nodeId !== 'string' || typeof detail.title !== 'string') {
    return null;
  }
  const request: DiscoursePublishDialogRequest = {
    content: detail.content,
    nodeId: detail.nodeId,
    title: detail.title
  };
  if (detail.catalog) {
    request.catalog = detail.catalog;
  }
  if (typeof detail.targetSiteUrl === 'string') {
    request.targetSiteUrl = detail.targetSiteUrl;
  }
  return request;
}
