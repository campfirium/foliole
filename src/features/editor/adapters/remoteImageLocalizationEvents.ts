export interface RemoteImageLocalizationRequest {
  recovery?: boolean;
  from: number;
  handled: boolean;
  nodeId: string;
  resolve: (localized: boolean) => void;
  source: string;
  to: number;
}

const EVENT_NAME = 'foliole:remote-image-localization-request';
const DISPLAYED_EVENT_NAME = 'foliole:remote-image-displayed';

export function reportRemoteImageDisplayed(target: HTMLElement, nodeId: string) {
  target.dispatchEvent(new CustomEvent(DISPLAYED_EVENT_NAME, { bubbles: true, detail: { nodeId } }));
}

export function listenForRemoteImageDisplayed(host: HTMLElement, listener: (nodeId: string) => void) {
  const handleDisplayed = (event: Event) => listener((event as CustomEvent<{ nodeId: string }>).detail.nodeId);
  host.addEventListener(DISPLAYED_EVENT_NAME, handleDisplayed);
  return () => host.removeEventListener(DISPLAYED_EVENT_NAME, handleDisplayed);
}

export function requestRemoteImageLocalization(
  target: HTMLElement,
  input: Pick<RemoteImageLocalizationRequest, 'from' | 'nodeId' | 'source' | 'to' | 'recovery'>
) {
  return new Promise<boolean>((resolve) => {
    const detail: RemoteImageLocalizationRequest = { ...input, handled: false, resolve };
    target.dispatchEvent(new CustomEvent(EVENT_NAME, { bubbles: true, detail }));
    if (!detail.handled) resolve(false);
  });
}

export function listenForRemoteImageLocalization(
  host: HTMLElement,
  listener: (request: RemoteImageLocalizationRequest) => void
) {
  const handleRequest = (event: Event) => listener(
    (event as CustomEvent<RemoteImageLocalizationRequest>).detail
  );
  host.addEventListener(EVENT_NAME, handleRequest);
  return () => host.removeEventListener(EVENT_NAME, handleRequest);
}
