import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getName: () => 'Foliole', isPackaged: false }
}));

import { bindMainWindowNavigationGuard } from './runtimeMainSupport.js';

it('blocks main window renderer navigation and renderer-created windows', () => {
  type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };
  type WillNavigateHandler = (event: { preventDefault: () => void }, url: string) => void;
  const windowOpenHandlers: WindowOpenHandler[] = [];
  const willNavigateHandlers: WillNavigateHandler[] = [];
  const webContents = {
    getURL: vi.fn(() => 'file:///D:/C/foliole/dist/desktop/index.html'),
    on: vi.fn((eventName: string, handler: WillNavigateHandler) => {
      if (eventName === 'will-navigate') {
        willNavigateHandlers.push(handler);
      }
    }),
    setZoomFactor: vi.fn(),
    setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
      windowOpenHandlers.push(handler);
    })
  };
  const window = {
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    once: vi.fn(),
    setTitle: vi.fn(),
    webContents
  };

  bindMainWindowNavigationGuard(window as never, 130);
  const navigationEvent = { preventDefault: vi.fn() };
  willNavigateHandlers[0]?.(navigationEvent, 'https://example.com');

  expect(webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
  expect(webContents.setZoomFactor).toHaveBeenCalledWith(1.3);
  expect(navigationEvent.preventDefault).toHaveBeenCalledTimes(1);
  expect(windowOpenHandlers[0]?.({ url: 'https://example.com' })).toEqual({ action: 'deny' });
});

it('allows the main process to load the initial local renderer before blocking later navigation', () => {
  type WillNavigateHandler = (event: { preventDefault: () => void }, url: string) => void;
  const willNavigateHandlers: WillNavigateHandler[] = [];
  let currentUrl = '';
  const webContents = {
    getURL: vi.fn(() => currentUrl),
    on: vi.fn((eventName: string, handler: WillNavigateHandler) => {
      if (eventName === 'will-navigate') {
        willNavigateHandlers.push(handler);
      }
    }),
    setZoomFactor: vi.fn(),
    setWindowOpenHandler: vi.fn()
  };
  const window = {
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    once: vi.fn(),
    setTitle: vi.fn(),
    webContents
  };

  bindMainWindowNavigationGuard(window as never);
  const startupNavigationEvent = { preventDefault: vi.fn() };
  willNavigateHandlers[0]?.(startupNavigationEvent, 'file:///D:/C/foliole/dist/desktop/index.html');
  currentUrl = 'file:///D:/C/foliole/dist/desktop/index.html';
  const laterNavigationEvent = { preventDefault: vi.fn() };
  willNavigateHandlers[0]?.(laterNavigationEvent, 'file:///D:/Users/example/secret.txt');

  expect(startupNavigationEvent.preventDefault).not.toHaveBeenCalled();
  expect(laterNavigationEvent.preventDefault).toHaveBeenCalledTimes(1);
});
