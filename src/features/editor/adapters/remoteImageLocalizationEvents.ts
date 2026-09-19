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
