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

it.each(['darwin', 'win32'] as const)('closes the main window after saving when background operation is enabled on %s', async (platform) => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never, createWindowReadingProgressFlushOptions(
    platform, () => false, () => false
  ));

  const event = window.triggerClose();
  await vi.waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
  expect(event.preventDefault).toHaveBeenCalled();
  expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  expect(window.hide).not.toHaveBeenCalled();
});

it.each(['darwin', 'win32'] as const)('hands window close to normal app quit on %s when enabled', (platform) => {
  const window = createWindowMock();
  const quit = vi.fn(() => true);
  bindWindowReadingProgressFlush(window as never, createWindowReadingProgressFlushOptions(
    platform, () => false, quit
  ));

  expect(window.triggerClose().preventDefault).toHaveBeenCalled();
  expect(quit).toHaveBeenCalledTimes(1);
  expect(window.close).not.toHaveBeenCalled();
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

it('allows the close event through when the app is quitting', () => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never, {
    shouldAllowClose: () => true
  });

  const closeEvent = window.triggerClose();

  expect(closeEvent.preventDefault).not.toHaveBeenCalled();
  expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
  expect(window.hide).not.toHaveBeenCalled();
});
