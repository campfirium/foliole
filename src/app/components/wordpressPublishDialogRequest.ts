import type { NativeWordPressPublishCatalog } from '../../../lib/platform/nativeWordPressPublishContract';

export const WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT = 'foliole:wordpress-publish-dialog-request';

export interface WordPressPublishDialogRequest {
  catalog?: NativeWordPressPublishCatalog;
  content: string;
  nodeId: string;
  targetSiteUrl: string;
  title: string;
}

export function requestWordPressPublishDialog(request: WordPressPublishDialogRequest) {
  window.dispatchEvent(new CustomEvent(WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT, { detail: request }));
}

export function readWordPressPublishDialogRequest(event: Event): WordPressPublishDialogRequest | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  const detail = event.detail as Partial<WordPressPublishDialogRequest>;
  if (
    typeof detail.content !== 'string' ||
    typeof detail.nodeId !== 'string' ||
    typeof detail.targetSiteUrl !== 'string' ||
    typeof detail.title !== 'string'
  ) return null;
  return {
    ...(detail.catalog ? { catalog: detail.catalog } : {}),
    content: detail.content,
    nodeId: detail.nodeId,
    targetSiteUrl: detail.targetSiteUrl,
    title: detail.title
  };
}
