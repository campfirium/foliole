import type { NativeFoliolePublishSettings } from '../../../lib/platform/nativeFoliolePublishContract';

export const FOLIOLE_PUBLISH_DIALOG_REQUEST_EVENT = 'foliole:web-publish-dialog-request';
export interface FoliolePublishDialogRequest {
  content: string;
  nodeId: string;
  settings: NativeFoliolePublishSettings;
  title: string;
}

export function requestFoliolePublishDialog(request: FoliolePublishDialogRequest) {
  window.dispatchEvent(new CustomEvent(FOLIOLE_PUBLISH_DIALOG_REQUEST_EVENT, { detail: request }));
}

export function readFoliolePublishDialogRequest(event: Event): FoliolePublishDialogRequest | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  const detail = event.detail as Partial<FoliolePublishDialogRequest>;
  return typeof detail.content === 'string' && typeof detail.nodeId === 'string'
    && typeof detail.title === 'string' && Boolean(detail.settings)
    ? detail as FoliolePublishDialogRequest : null;
}
