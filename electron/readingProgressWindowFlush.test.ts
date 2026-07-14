// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  allowWindowCloseWithoutReadingProgressFlush,
  bindWindowReadingProgressFlush,
  createWindowReadingProgressFlushOptions,
  flushWindowReadingProgress
} from './readingProgressWindowFlush.js';

function createWindowMock() {
  const listeners = new Map<string, Array<(event: { preventDefault: () => void }) => void>>();
  return {
    close: vi.fn(),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event: string, handler: (event: { preventDefault: () => void }) => void) => {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, handler]);
    }),
    webContents: {
      executeJavaScript: vi.fn(() => Promise.resolve(true)),
      isDestroyed: vi.fn(() => false)
    },
    triggerClose() {
      const event = { preventDefault: vi.fn() };
      for (const handler of listeners.get('close') ?? []) {
        handler(event);
      }
      return event;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('only bypasses close flushing during app quit on supported desktop hosts', () => {
  const shouldAllowClose = vi.fn(() => true);

  expect(createWindowReadingProgressFlushOptions('darwin', shouldAllowClose)).toEqual({ shouldAllowClose });
  expect(createWindowReadingProgressFlushOptions('linux', shouldAllowClose)).toEqual({});
  expect(createWindowReadingProgressFlushOptions('win32', shouldAllowClose)).toMatchObject({ shouldAllowClose });
});

it('keeps the Windows background-close behavior in the shared options', () => {
  const window = createWindowMock();
  const options = createWindowReadingProgressFlushOptions('win32', () => false);

  options.onCloseAfterFlush?.(window as never);

  expect(window.hide).toHaveBeenCalledTimes(1);
});

it('executes the renderer close flush when available', async () => {
  const window = createWindowMock();

  await expect(flushWindowReadingProgress(window as never)).resolves.toBe(true);
  expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(
    'Promise.all([globalThis.__folioleFlushReadingProgressBeforeClose?.() ?? true, globalThis.__folioleFlushPendingEditorDraftBeforeClose?.() ?? true, globalThis.__folioleFlushLocalFileBeforeClose?.() ?? true]).then((results) => results.every(Boolean))',
    true
  );
});

it('flushes once before allowing the window to close', async () => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never);

  const closeEvent = window.triggerClose();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
  expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  expect(window.close).toHaveBeenCalledTimes(1);
});

it('continues closing when renderer close flush times out', async () => {
  vi.useFakeTimers();
  const window = createWindowMock();
  window.webContents.executeJavaScript.mockReturnValue(new Promise(() => undefined));
  bindWindowReadingProgressFlush(window as never);

  const closeEvent = window.triggerClose();
  await vi.advanceTimersByTimeAsync(2500);

  expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
  expect(window.close).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it('skips the flush after the window has already been approved to close', () => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never);
  allowWindowCloseWithoutReadingProgressFlush(window as never);

  const closeEvent = window.triggerClose();

  expect(closeEvent.preventDefault).not.toHaveBeenCalled();
  expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
});

it('flushes before hiding a background-capable window', async () => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never, {
    onCloseAfterFlush: (targetWindow) => targetWindow.hide()
  });

  const closeEvent = window.triggerClose();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
  expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  expect(window.hide).toHaveBeenCalledTimes(1);
  expect(window.close).not.toHaveBeenCalled();
});

it('allows the close event through when the app is quitting', () => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never, {
    onCloseAfterFlush: (targetWindow) => targetWindow.hide(),
    shouldAllowClose: () => true
  });

  const closeEvent = window.triggerClose();

  expect(closeEvent.preventDefault).not.toHaveBeenCalled();
  expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
  expect(window.hide).not.toHaveBeenCalled();
});
