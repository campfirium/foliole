import { expect, it, vi } from 'vitest';

import {
  bindEmbeddedLinkPanelContents,
  isAllowedEmbeddedLinkPanelUrl
} from './runtimeMainSupport.js';

it('allows only http and https URLs for embedded link panel window opens', () => {
  expect(isAllowedEmbeddedLinkPanelUrl('https://example.com/path')).toBe(true);
  expect(isAllowedEmbeddedLinkPanelUrl('http://example.com/path')).toBe(true);
  expect(isAllowedEmbeddedLinkPanelUrl('file:///C:/Users/example/secret.txt')).toBe(false);
  expect(isAllowedEmbeddedLinkPanelUrl('javascript:alert(1)')).toBe(false);
});

it('denies blocked embedded link panel window opens without loading them', () => {
  type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };
  const handlers: WindowOpenHandler[] = [];
  const contents = {
    getType: vi.fn(() => 'webview'),
    loadURL: vi.fn(),
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
