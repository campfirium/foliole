import { expect, it } from 'vitest';

import { probeUrlWithLinkPanel } from './linkPanelUrlProbe';

function probeElement() {
  const webview = document.body.querySelector('webview');
  if (!webview) throw new Error('Expected a link-panel probe webview.');
  return webview;
}

it('uses the same secured session and load event as material link panels', async () => {
  const result = probeUrlWithLinkPanel('https://known-site.pages.dev');
  const webview = probeElement();
  expect(webview.getAttribute('partition')).toBe('foliole-link-panels');
  expect(webview.getAttribute('src')).toBe('https://known-site.pages.dev');
  webview.dispatchEvent(new Event('dom-ready'));
  await expect(result).resolves.toBe(true);
  expect(webview).not.toBeInTheDocument();
});

it('reports a failed main-frame load as not detected without claiming availability', async () => {
  const result = probeUrlWithLinkPanel('https://unknown-site.pages.dev');
  const failure = Object.assign(new Event('did-fail-load'), {
    errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED', isMainFrame: true
  });
  probeElement().dispatchEvent(failure);
  await expect(result).resolves.toBe(false);
});

it('treats another navigation failure as not detected rather than occupied', async () => {
  const result = probeUrlWithLinkPanel('https://blocked-site.pages.dev');
  const failure = Object.assign(new Event('did-fail-load'), {
    errorCode: -101, errorDescription: 'ERR_CONNECTION_RESET', isMainFrame: true
  });
  probeElement().dispatchEvent(failure);
  await expect(result).resolves.toBe(false);
});
