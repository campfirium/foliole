import path from 'node:path';

import { expect, it, vi } from 'vitest';

const { appMock } = vi.hoisted(() => ({
  appMock: { getName: vi.fn(() => 'foliole'), isPackaged: false }
}));

vi.mock('electron', () => ({
  app: appMock
}));

import {
  bindMainWindowWebviewAttachGuard,
  bindEmbeddedLinkPanelContents,
  applyHiddenNativeDesktopWindowOptions,
  createMainWindowOptions,
  isAllowedEmbeddedLinkPanelUrl,
  resolveMainWindowIconPath,
  resolveMainWindowTitle
} from './runtimeMainSupport.js';

it('keeps the startup renderer unthrottled while the hidden window is loading', () => {
  expect(createMainWindowOptions('/tmp/preload.cjs').webPreferences?.backgroundThrottling).toBe(false);
});

it('disables DevTools in packaged main window options', () => {
  appMock.isPackaged = true;

  expect(createMainWindowOptions('/tmp/preload.cjs').webPreferences?.devTools).toBe(false);

  appMock.isPackaged = false;
  expect(createMainWindowOptions('/tmp/preload.cjs').webPreferences?.devTools).toBe(true);
});

it('uses the branded runtime window icon next to the electron preload source', () => {
  const expectedIconPath = path.resolve('/workspace/foliole/build/icon.png');
  expect(resolveMainWindowIconPath('/workspace/foliole/electron/preload.cjs')).toBe(expectedIconPath);
  expect(createMainWindowOptions('/workspace/foliole/electron/preload.cjs').icon).toBe(expectedIconPath);
});

it('uses the internal product title for internal Windows builds', () => {
  expect(resolveMainWindowTitle('foliole-internal')).toBe('Foliole Internal');
  expect(createMainWindowOptions('/workspace/foliole/electron/preload.cjs').title).toBe('Foliole');

  appMock.getName.mockReturnValue('foliole-internal');
  expect(createMainWindowOptions('/workspace/foliole/electron/preload.cjs').title).toBe('Foliole Internal');
  appMock.getName.mockReturnValue('foliole');
});

it('pins hidden native desktop test windows offscreen and out of the taskbar', () => {
  expect(
    applyHiddenNativeDesktopWindowOptions(
      { height: 900, show: true, width: 1400, x: 80, y: 80 },
      { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' },
      'win32'
    )
  ).toMatchObject({
    focusable: false,
    height: 1000,
    show: false,
    skipTaskbar: true,
    width: 1600,
    x: -32_000,
    y: -32_000
  });

  expect(applyHiddenNativeDesktopWindowOptions({ x: 80 }, {})).toEqual({ x: 80 });
});

it('uses transparent hidden native windows on macOS where offscreen bounds are clamped', () => {
  expect(applyHiddenNativeDesktopWindowOptions(
    { height: 900, show: true, width: 1400 },
    { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' },
    'darwin'
  )).toMatchObject({
    focusable: false,
    height: 1000,
    opacity: 0,
    show: false,
    skipTaskbar: true,
    width: 1600
  });
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
  const navigateHandlers: Array<(event: { preventDefault: () => void }, url: string) => void> = [];
  const session = {
    on: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn()
  };
  const contents = {
    getType: vi.fn(() => 'webview'),
    loadURL: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((eventName: string, handler: (event: { preventDefault: () => void }, url: string) => void) => {
      if (eventName === 'will-navigate') {
        navigateHandlers.push(handler);
      }
    }),
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
  expect(contents.loadURL).toHaveBeenCalledWith('https://example.com', { httpReferrer: '' });

  const blockedNavigationEvent = { preventDefault: vi.fn() };
  navigateHandlers[0]?.(blockedNavigationEvent, 'javascript:alert(1)');
  expect(blockedNavigationEvent.preventDefault).toHaveBeenCalledTimes(1);

  const allowedNavigationEvent = { preventDefault: vi.fn() };
  navigateHandlers[0]?.(allowedNavigationEvent, 'https://example.com/next');
  expect(allowedNavigationEvent.preventDefault).not.toHaveBeenCalled();
});

it('does not bind embedded link panel guards to the main window contents', () => {
  const contents = {
    getType: vi.fn(() => 'window'),
    loadURL: vi.fn(),
    on: vi.fn(),
    session: {
      on: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn()
    },
    setWindowOpenHandler: vi.fn()
  };

  bindEmbeddedLinkPanelContents(contents as never);

  expect(contents.setWindowOpenHandler).not.toHaveBeenCalled();
  expect(contents.on).not.toHaveBeenCalled();
  expect(contents.session.setPermissionRequestHandler).not.toHaveBeenCalled();
  expect(contents.session.on).not.toHaveBeenCalled();
});

it('allows only the fixed link panel partition and web URLs for webview attach', () => {
  type AttachHandler = (
    event: { preventDefault: () => void },
    webPreferences: Record<string, unknown>,
    params: Record<string, string | undefined>
  ) => void;
  const attachHandlers: AttachHandler[] = [];
  const webContents = {
    on: vi.fn((eventName: string, handler: AttachHandler) => {
      if (eventName === 'will-attach-webview') {
        attachHandlers.push(handler);
      }
    })
  };

  bindMainWindowWebviewAttachGuard({ webContents } as never);
  const handler = attachHandlers[0] as AttachHandler;
  const allowedEvent = { preventDefault: vi.fn() };
  const webPreferences = {
    contextIsolation: false,
    nodeIntegration: true,
    preload: '/tmp/unsafe-preload.js',
    sandbox: false
  };

  handler(allowedEvent, webPreferences, {
    partition: 'foliole-link-panels',
    src: 'https://example.com/docs'
  });

  expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
  expect(webPreferences).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  });

  const blockedSrcEvent = { preventDefault: vi.fn() };
  handler(blockedSrcEvent, {}, { partition: 'foliole-link-panels', src: 'file:///tmp/secret.txt' });
  expect(blockedSrcEvent.preventDefault).toHaveBeenCalledTimes(1);

  const blockedPartitionEvent = { preventDefault: vi.fn() };
  handler(blockedPartitionEvent, {}, { partition: 'persist:foliole-link-panels', src: 'https://example.com' });
  expect(blockedPartitionEvent.preventDefault).toHaveBeenCalledTimes(1);
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
  const permissionCheckHandlers: Array<() => boolean> = [];
  const downloadHandlers: DownloadHandler[] = [];
  const session = {
    on: vi.fn((eventName: string, handler: DownloadHandler) => {
      if (eventName === 'will-download') {
        downloadHandlers.push(handler);
      }
    }),
    setPermissionCheckHandler: vi.fn((handler: () => boolean) => {
      permissionCheckHandlers.push(handler);
    }),
    setPermissionRequestHandler: vi.fn((handler: PermissionHandler) => {
      permissionHandlers.push(handler);
    })
  };
  const contents = {
    getType: vi.fn(() => 'webview'),
    loadURL: vi.fn(),
    on: vi.fn(),
    session,
    setWindowOpenHandler: vi.fn()
  };

  bindEmbeddedLinkPanelContents(contents as never);
  const permissionCallback = vi.fn();
  expect(permissionCheckHandlers[0]?.()).toBe(false);
  permissionHandlers[0]?.({ getType: () => 'webview' }, 'media', permissionCallback);
  const downloadEvent = { preventDefault: vi.fn() };
  downloadHandlers[0]?.(downloadEvent, null, { getType: () => 'webview' });

  expect(permissionCallback).toHaveBeenCalledWith(false);
  expect(downloadEvent.preventDefault).toHaveBeenCalledTimes(1);
});
