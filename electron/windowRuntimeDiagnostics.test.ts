// @vitest-environment node
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendBootEvent: vi.fn().mockResolvedValue(undefined),
  appendMainProcessDiagnosticLog: vi.fn(),
  resolveWindowsDiagnosticLogPath: vi.fn((fileName: string) => path.join(os.tmpdir(), 'foliole-test-logs', fileName))
}));

vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendMainProcessDiagnosticLog
}));
vi.mock('./diagnostics/windowsDiagnosticPaths.js', () => ({
  resolveWindowsDiagnosticLogPath: mocks.resolveWindowsDiagnosticLogPath
}));
vi.mock('./ipc/boot.js', () => ({
  appendBootEvent: mocks.appendBootEvent
}));

function createWindowMock() {
  const windowEmitter = new EventEmitter();
  const webContents = new EventEmitter() as EventEmitter & {
    executeJavaScript: ReturnType<typeof vi.fn>;
    getURL: ReturnType<typeof vi.fn>;
  };
  let visible = false;
  webContents.executeJavaScript = vi.fn().mockResolvedValue(true);
  webContents.getURL = vi.fn(() => 'http://127.0.0.1:24600/');
  return Object.assign(windowEmitter, {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    maximize: vi.fn(),
    setFullScreen: vi.fn(),
    show: vi.fn(() => {
      visible = true;
    }),
    webContents
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

describe('window runtime startup visibility', () => {
  it('only logs ready-to-show and waits for the startup skeleton paint before showing', async () => {
    const window = createWindowMock();
    const { bindWindowRuntimeDiagnostics, presentInitialRendererWindow, setStartupWindowPresentation } = await import('./windowRuntimeDiagnostics.js');

    setStartupWindowPresentation(window as never, {
      isFullScreen: false,
      isMaximized: true
    });
    bindWindowRuntimeDiagnostics(window as never);
    window.emit('ready-to-show');

    expect(window.show).not.toHaveBeenCalled();
    const presentPromise = presentInitialRendererWindow(window as never);
    await vi.runAllTimersAsync();
    await presentPromise;

    expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalledTimes(1);
    expect(mocks.appendBootEvent).toHaveBeenCalledWith(
      'window_startup-skeleton-show',
      expect.objectContaining({ isMaximized: true })
    );
  });
});
