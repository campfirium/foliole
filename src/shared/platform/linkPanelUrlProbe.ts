const PROBE_TIMEOUT_MS = 5_000;

export const LINK_PANEL_WEBVIEW_PROPS = {
  allowpopups: 'false',
  disablewebsecurity: 'false',
  nodeintegration: 'false',
  partition: 'foliole-link-panels',
  referrerpolicy: 'no-referrer',
  webpreferences: 'contextIsolation=yes, sandbox=yes, nodeIntegration=no'
} as const;

type WebviewFailureEvent = Event & { isMainFrame?: boolean };

function configureProbe(webview: HTMLElement, url: string) {
  Object.entries(LINK_PANEL_WEBVIEW_PROPS).forEach(([name, value]) => webview.setAttribute(name, value));
  webview.setAttribute('src', url);
  Object.assign(webview.style, {
    height: '1px', left: '-10000px', opacity: '0', pointerEvents: 'none',
    position: 'fixed', width: '1px'
  });
}

export function probeUrlWithLinkPanel(url: string) {
  return new Promise<boolean>((resolve) => {
    const webview = document.createElement('webview');
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      webview.remove();
      resolve(result);
    };
    const handleFailure = (event: Event) => {
      const failure = event as WebviewFailureEvent;
      if (failure.isMainFrame === false) return;
      finish(false);
    };
    webview.addEventListener('dom-ready', () => finish(true), { once: true });
    webview.addEventListener('did-fail-load', handleFailure);
    const timeout = window.setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    configureProbe(webview, url);
    document.body.append(webview);
  });
}
