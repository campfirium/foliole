import { Buffer } from 'node:buffer';

import { expect, it, vi } from 'vitest';

const { appMock } = vi.hoisted(() => ({
  appMock: { getName: vi.fn(() => 'foliole'), isPackaged: false }
}));

vi.mock('electron', () => ({
  app: appMock
}));

import {
  bindMainWindowNavigationGuard,
  createMainWindowOptions,
  resolvePreviewWindowTitle
} from './runtimeMainSupport.js';

it('uses the preview label as the native window title', () => {
  expect(resolvePreviewWindowTitle({ FOLIOLE_PREVIEW_LABEL: ' 外链预览 ' })).toBe('外链预览');
  expect(resolvePreviewWindowTitle({ FOLIOLE_PREVIEW_LABEL_B64: Buffer.from('编辑器性能预览', 'utf8').toString('base64') })).toBe('编辑器性能预览');

  const oldLabel = process.env.FOLIOLE_PREVIEW_LABEL;
  const oldEncodedLabel = process.env.FOLIOLE_PREVIEW_LABEL_B64;
  process.env.FOLIOLE_PREVIEW_LABEL = '外链预览';
  delete process.env.FOLIOLE_PREVIEW_LABEL_B64;
  try {
    expect(createMainWindowOptions('/tmp/preload.cjs').title).toBe('外链预览');
  } finally {
    if (oldLabel === undefined) delete process.env.FOLIOLE_PREVIEW_LABEL;
    else process.env.FOLIOLE_PREVIEW_LABEL = oldLabel;
    if (oldEncodedLabel === undefined) delete process.env.FOLIOLE_PREVIEW_LABEL_B64;
    else process.env.FOLIOLE_PREVIEW_LABEL_B64 = oldEncodedLabel;
  }
});

it('uses the app title when no preview label is set', () => {
  expect(resolvePreviewWindowTitle({})).toBe('');
  expect(createMainWindowOptions('/tmp/preload.cjs').title).toBe('Foliole');
});

it('prevents renderer title updates from overriding the preview label', () => {
  vi.useFakeTimers();
  const oldLabel = process.env.FOLIOLE_PREVIEW_LABEL;
  process.env.FOLIOLE_PREVIEW_LABEL = '外链预览';
  const webContentsHandlers: Array<(event: { preventDefault: () => void }) => void> = [];
  const windowHandlers: Array<(event: { preventDefault: () => void }) => void> = [];
  const webContentsRestoreHandlers: Array<() => void> = [];
  const windowRestoreHandlers: Array<() => void> = [];
  const webContents = {
    on: vi.fn((eventName: string, handler: ((event: { preventDefault: () => void }) => void) | (() => void)) => {
      if (eventName === 'page-title-updated') webContentsHandlers.push(handler as (event: { preventDefault: () => void }) => void);
      if (eventName === 'dom-ready' || eventName === 'did-finish-load') webContentsRestoreHandlers.push(handler as () => void);
    }),
    setWindowOpenHandler: vi.fn()
  };
  const window = {
    isDestroyed: vi.fn(() => false),
    on: vi.fn((eventName: string, handler: (event: { preventDefault: () => void }) => void) => {
      if (eventName === 'page-title-updated') windowHandlers.push(handler);
    }),
    once: vi.fn((eventName: string, handler: () => void) => {
      if (eventName === 'ready-to-show') windowRestoreHandlers.push(handler);
    }),
    setTitle: vi.fn(),
    webContents
  };
  try {
    bindMainWindowNavigationGuard(window as never);
    const event = { preventDefault: vi.fn() };
    windowHandlers[0]?.(event);
    webContentsHandlers[0]?.(event);
    webContentsRestoreHandlers.forEach((handler) => handler());
    windowRestoreHandlers.forEach((handler) => handler());
    vi.advanceTimersByTime(1000);

    expect(window.setTitle).toHaveBeenCalledWith('外链预览');
    expect(window.setTitle).toHaveBeenCalledTimes(7);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
  } finally {
    if (oldLabel === undefined) delete process.env.FOLIOLE_PREVIEW_LABEL;
    else process.env.FOLIOLE_PREVIEW_LABEL = oldLabel;
    vi.useRealTimers();
  }
});

it('prevents renderer title updates from overriding the app title', () => {
  vi.useFakeTimers();
  const oldLabel = process.env.FOLIOLE_PREVIEW_LABEL;
  delete process.env.FOLIOLE_PREVIEW_LABEL;
  appMock.getName.mockReturnValue('foliole-internal');
  const webContentsHandlers: Array<(event: { preventDefault: () => void }) => void> = [];
  const webContents = {
    on: vi.fn((eventName: string, handler: ((event: { preventDefault: () => void }) => void) | (() => void)) => {
      if (eventName === 'page-title-updated') webContentsHandlers.push(handler as (event: { preventDefault: () => void }) => void);
    }),
    setWindowOpenHandler: vi.fn()
  };
  const window = {
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    once: vi.fn(),
    setTitle: vi.fn(),
    webContents
  };
  try {
    bindMainWindowNavigationGuard(window as never);
    const event = { preventDefault: vi.fn() };
    webContentsHandlers[0]?.(event);

    expect(window.setTitle).toHaveBeenCalledWith('Foliole Internal');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  } finally {
    appMock.getName.mockReturnValue('foliole');
    if (oldLabel === undefined) delete process.env.FOLIOLE_PREVIEW_LABEL;
    else process.env.FOLIOLE_PREVIEW_LABEL = oldLabel;
    vi.useRealTimers();
  }
});
