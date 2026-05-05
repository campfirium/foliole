// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  allowWindowCloseWithoutReadingProgressFlush,
  bindWindowReadingProgressFlush,
  flushWindowReadingProgress
} from './readingProgressWindowFlush.js';

function createWindowMock() {
  const listeners = new Map<string, Array<(event: { preventDefault: () => void }) => void>>();
  return {
    close: vi.fn(),
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

it('executes the renderer close flush when available', async () => {
  const window = createWindowMock();

  await expect(flushWindowReadingProgress(window as never)).resolves.toBe(true);
  expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(
    'Promise.all([globalThis.__folioleFlushReadingProgressBeforeClose?.() ?? true, globalThis.__folioleFlushPendingEditorDraftBeforeClose?.() ?? true]).then((results) => results.every(Boolean))',
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

it('skips the flush after the window has already been approved to close', () => {
  const window = createWindowMock();
  bindWindowReadingProgressFlush(window as never);
  allowWindowCloseWithoutReadingProgressFlush(window as never);

  const closeEvent = window.triggerClose();

  expect(closeEvent.preventDefault).not.toHaveBeenCalled();
  expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
});
