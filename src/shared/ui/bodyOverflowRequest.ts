import type { EditorBodyOverflow } from '../../features/editor/adapters/EditorAdapter';

import { showNodeTextLimitNotice } from './nodeTextSaveBudget';

export const BODY_OVERFLOW_REQUEST_EVENT = 'foliole:body-overflow';

export interface BodyOverflowRequest extends EditorBodyOverflow {
  prepare: () => boolean;
  cancel: () => void;
}

export function requestBodyOverflow(request: BodyOverflowRequest) {
  const event = new CustomEvent<BodyOverflowRequest>(BODY_OVERFLOW_REQUEST_EVENT, { detail: request, cancelable: true });
  if (window.dispatchEvent(event)) showNodeTextLimitNotice();
}

export function listenForBodyOverflow(listener: (request: BodyOverflowRequest) => void) {
  const receive = (event: Event) => {
    if (event instanceof CustomEvent) {
      event.preventDefault();
      listener(event.detail as BodyOverflowRequest);
    }
  };
  window.addEventListener(BODY_OVERFLOW_REQUEST_EVENT, receive);
  return () => window.removeEventListener(BODY_OVERFLOW_REQUEST_EVENT, receive);
}
