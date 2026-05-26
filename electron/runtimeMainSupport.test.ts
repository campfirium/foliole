import { expect, it, vi } from 'vitest';

import {
  bindEmbeddedLinkPanelContents,
  createMainWindowOptions,
  isAllowedEmbeddedLinkPanelUrl,
  resolveMainWindowIconPath
} from './runtimeMainSupport.js';

it('keeps the startup renderer unthrottled while the hidden window is loading', () => {
  expect(createMainWindowOptions('/tmp/preload.cjs').webPreferences?.backgroundThrottling).toBe(false);
});

it('uses the branded runtime window icon next to the electron preload source', () => {
  expect(resolveMainWindowIconPath('/workspace/foliole/electron/preload.cjs')).toBe(
    '/workspace/foliole/build/icon.png'
  );
  expect(createMainWindowOptions('/workspace/foliole/electron/preload.cjs').icon).toBe(
    '/workspace/foliole/build/icon.png'
  );
});

it('allows only http and https URLs for embedded link panel window opens', () => {
  expect(isAllowedEmbeddedLinkPanelUrl('https://example.com/path')).toBe(true);
  expect(isAllowedEmbeddedLinkPanelUrl('http://example.com/path')).toBe(true);
  expect(isAllowedEmbeddedLinkPanelUrl('file:///C:/Users/example/secret.txt')).toBe(false);
  expect(isAllowedEmbeddedLinkPanelUrl('javascript:alert(1)')).toBe(false);
});

it('denies blocked embedded link panel window opens without loading them', () => {
  type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };
  const handlers: WindowOpenHandler[] = [];
  const session = {
    on: vi.fn(),
    setPermissionRequestHandler: vi.fn()
  };
  const contents = {
    getType: vi.fn(() => 'webview'),
    loadURL: vi.fn(),
    session,
    setWindowOpenHandler: vi.fn((nextHandler: WindowOpenHandler) => {
      handlers.push(nextHandler);
    })
  };

  bindEmbeddedLinkPanelContents(contents as never);
  const installedHandler = handlers[0] as WindowOpenHandler;

  expect(installedHandler({ url: 'file:///C:/Users/example/secret.txt' })).toEqual({ action: 'deny' });
  expect(contents.loadURL).not.toHaveBeenCalled();
  expect(installedHandler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
  expect(contents.loadURL).toHaveBeenCalledWith('https://example.com');
});

it('denies embedded link panel permissions and prevents downloads', () => {
  type PermissionHandler = (
    webContents: { getType: () => string },
    permission: string,
    callback: (granted: boolean) => void
  ) => void;
  type DownloadHandler = (
    event: { preventDefault: () => void },
    item: unknown,
    webContents: { getType: () => string }
  ) => void;
  const permissionHandlers: PermissionHandler[] = [];
  const downloadHandlers: DownloadHandler[] = [];
  const session = {
    on: vi.fn((eventName: string, handler: DownloadHandler) => {
      if (eventName === 'will-download') {
        downloadHandlers.push(handler);
      }
    }),
    setPermissionRequestHandler: vi.fn((handler: PermissionHandler) => {
      permissionHandlers.push(handler);
    })
  };
  const contents = {
    getType: vi.fn(() => 'webview'),
    loadURL: vi.fn(),
    session,
    setWindowOpenHandler: vi.fn()
  };

  bindEmbeddedLinkPanelContents(contents as never);
  const permissionCallback = vi.fn();
  permissionHandlers[0]?.({ getType: () => 'webview' }, 'media', permissionCallback);
  const downloadEvent = { preventDefault: vi.fn() };
  downloadHandlers[0]?.(downloadEvent, null, { getType: () => 'webview' });

  expect(permissionCallback).toHaveBeenCalledWith(false);
  expect(downloadEvent.preventDefault).toHaveBeenCalledTimes(1);
});
