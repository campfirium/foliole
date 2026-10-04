import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Page } from '@playwright/test';

import { LINK_PANEL_WEBVIEW_PROPS } from '../../src/shared/platform/external/linkPanelUrlProbe';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function openNormalPanel(page: Page, href: string) {
  await page.evaluate(async (url) => {
    const api = window.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{
      id: 'webview-security-fixture', kind: 'topic', title: 'Webview security fixture',
      content: `# Webview security fixture\n\n[Open test page](${url})`
    }]);
    await api?.openNode?.('webview-security-fixture');
  }, href);
  await page.locator(`[data-md-link-url="${href}"]`).click();
  await expect(page.locator('webview')).toHaveCount(1);
}

async function readResult(page: Page, selector: string) {
  return page.evaluate(async (target) => {
    const guest = document.querySelector(target) as HTMLElement & {
      executeJavaScript: (code: string) => Promise<string>;
    };
    try {
      return await guest.executeJavaScript('document.body.dataset.result || ""');
    } catch {
      return '';
    }
  }, selector);
}

async function attachHostileGuest(page: Page, href: string) {
  await page.evaluate(({ url, props }) => {
    const guest = document.createElement('webview');
    Object.entries(props).forEach(([name, value]) => guest.setAttribute(name, value));
    guest.id = 'hostile-guest';
    guest.setAttribute('disablewebsecurity', 'false');
    guest.setAttribute('nodeintegration', 'false');
    guest.setAttribute('allowpopups', 'false');
    guest.setAttribute('webpreferences', 'webSecurity=no,allowRunningInsecureContent=yes,nodeIntegration=yes,nodeIntegrationInWorker=yes,nodeIntegrationInSubFrames=yes,contextIsolation=no,sandbox=no');
    guest.setAttribute('src', url);
    guest.style.cssText = 'position:fixed;left:-10000px;width:1px;height:1px';
    document.body.append(guest);
  }, { url: href, props: LINK_PANEL_WEBVIEW_PROPS });
}

test('link panels load normally and enforce web security against hostile attach preferences', async ({
  desktopWindow, desktopApp
}, testInfo) => {
  const crossServer = createServer((_request, response) => response.end('cross-origin secret'));
  const crossOrigin = await listen(crossServer);
  const pageServer = createServer((request, response) => {
    if (request.url === '/same') {
      response.end('same-origin content');
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<title>Security fixture</title><h1>Link panel loaded</h1><script>
      (async () => {
        const same = await fetch('/same').then(r => r.text());
        const cross = await fetch('${crossOrigin}/secret').then(r => r.text()).catch(() => 'blocked');
        document.body.dataset.result = JSON.stringify({ same, cross, node: typeof require });
      })();
    </script>`);
  });
  const pageOrigin = await listen(pageServer);
  try {
    await expectWorkspaceShell(desktopWindow);
    await openNormalPanel(desktopWindow, `${pageOrigin}/page`);
    const expected = { same: 'same-origin content', cross: 'blocked', node: 'undefined' };
    await expect.poll(() => readResult(desktopWindow, 'webview')).toBe(JSON.stringify(expected));
    for (const attribute of ['disablewebsecurity', 'nodeintegration', 'allowpopups']) {
      await expect(desktopWindow.locator('webview')).not.toHaveAttribute(attribute);
    }
    await mkdir('.tmp/artifacts/webview-security', { recursive: true });
    await desktopWindow.screenshot({ path: '.tmp/artifacts/webview-security/normal-panel.png' });

    await attachHostileGuest(desktopWindow, `${pageOrigin}/hostile`);
    await expect.poll(() => readResult(desktopWindow, '#hostile-guest')).toBe(JSON.stringify(expected));
    const preferences = await desktopApp.evaluate(({ webContents }, href) => {
      const guest = webContents.getAllWebContents().find((contents) => contents.getURL() === href);
      const prefs = guest?.getLastWebPreferences();
      return {
        webSecurity: prefs?.webSecurity, allowRunningInsecureContent: prefs?.allowRunningInsecureContent,
        nodeIntegration: prefs?.nodeIntegration, nodeIntegrationInWorker: prefs?.nodeIntegrationInWorker,
        nodeIntegrationInSubFrames: prefs?.nodeIntegrationInSubFrames,
        contextIsolation: prefs?.contextIsolation, sandbox: prefs?.sandbox
      };
    }, `${pageOrigin}/hostile`);
    expect(preferences).toEqual({
      webSecurity: true, allowRunningInsecureContent: false, nodeIntegration: false,
      nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true
    });
    await testInfo.attach('guest-security-results', {
      body: JSON.stringify({ normal: expected, hostile: expected, preferences }, null, 2),
      contentType: 'application/json'
    });
  } finally {
    await desktopWindow.evaluate(() => document.querySelector('#hostile-guest')?.remove()).catch(() => {});
    await Promise.all([close(pageServer), close(crossServer)]);
  }
});
