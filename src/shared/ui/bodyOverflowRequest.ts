import type { EditorBodyOverflow } from '../../features/editor/adapters/EditorAdapter';

export const BODY_OVERFLOW_REQUEST_EVENT = 'foliole:body-overflow';

export interface BodyOverflowRequest extends EditorBodyOverflow {
  prepare: () => boolean;
  cancel: () => void;
}

export function requestBodyOverflow(request: BodyOverflowRequest) {
  window.dispatchEvent(new CustomEvent<BodyOverflowRequest>(BODY_OVERFLOW_REQUEST_EVENT, { detail: request }));
}

export function listenForBodyOverflow(listener: (request: BodyOverflowRequest) => void) {
  const receive = (event: Event) => {
    if (event instanceof CustomEvent) listener(event.detail as BodyOverflowRequest);
  };
  window.addEventListener(BODY_OVERFLOW_REQUEST_EVENT, receive);
  return () => window.removeEventListener(BODY_OVERFLOW_REQUEST_EVENT, receive);
}
