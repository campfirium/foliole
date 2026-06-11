// @vitest-environment node
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
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
  let fullScreen = false;
  let maximized = false;
  webContents.executeJavaScript = vi.fn().mockResolvedValue(true);
  webContents.getURL = vi.fn(() => 'http://127.0.0.1:24600/');
  return Object.assign(windowEmitter, {
    isDestroyed: vi.fn(() => false),
    isFullScreen: vi.fn(() => fullScreen),
    isMaximized: vi.fn(() => maximized),
    isVisible: vi.fn(() => visible),
    maximize: vi.fn(() => {
      maximized = true;
    }),
    getBounds: vi.fn(() => ({ height: 900, width: 1400, x: 0, y: 0 })),
    setFullScreen: vi.fn((next: boolean) => {
      fullScreen = next;
    }),
    show: vi.fn(() => {
      visible = true;
    }),
    webContents
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fs.rmSync(path.join(os.tmpdir(), 'foliole-test-logs'), { force: true, recursive: true });
});

describe('window runtime startup visibility', () => {
  it('shows the initial renderer window without waiting for a startup skeleton', async () => {
    const window = createWindowMock();
    const { bindWindowRuntimeDiagnostics, presentInitialRendererWindow, setStartupWindowPresentation } = await import('./windowRuntimeDiagnostics.js');

    setStartupWindowPresentation(window as never, {
      isFullScreen: false,
      isMaximized: true
    });
    bindWindowRuntimeDiagnostics(window as never);
    window.emit('ready-to-show');

    expect(window.show).not.toHaveBeenCalled();
    await presentInitialRendererWindow(window as never);

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
    expect(window.maximize).toHaveBeenCalledTimes(1);
    expect(window.show).toHaveBeenCalledTimes(1);
    expect(mocks.appendBootEvent).toHaveBeenCalledWith(
      'window_initial-renderer-window-show',
      expect.objectContaining({ isMaximized: true })
    );
  });

  it('restores fullscreen before the initial renderer window is shown', async () => {
    const window = createWindowMock();
    const { presentInitialRendererWindow, setStartupWindowPresentation } = await import('./windowRuntimeDiagnostics.js');

    setStartupWindowPresentation(window as never, {
      isFullScreen: true,
      isMaximized: false
    });
    await presentInitialRendererWindow(window as never);

    expect(window.setFullScreen).toHaveBeenCalledWith(true);
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it('keeps an already visible window visible', async () => {
    const window = createWindowMock();
    window.show();
    vi.clearAllMocks();
    const { presentInitialRendererWindow } = await import('./windowRuntimeDiagnostics.js');

    await presentInitialRendererWindow(window as never);

    expect(window.show).not.toHaveBeenCalled();
    expect(mocks.appendBootEvent).toHaveBeenCalledWith(
      'window_visible',
      expect.objectContaining({ isVisible: true })
    );
  });

});

describe('window runtime diagnostics redaction', () => {
  it('redacts renderer state snapshots before writing the diagnostic log', async () => {
    const window = createWindowMock();
    window.webContents.executeJavaScript.mockResolvedValue({
      bodyTextSample: 'Private body',
      href: 'file:///Users/alice/private.md',
      message: 'Failed at /Users/alice/private.md',
      readyState: 'complete'
    });
    const { bindWindowRuntimeDiagnostics } = await import('./windowRuntimeDiagnostics.js');

    bindWindowRuntimeDiagnostics(window as never);
    window.webContents.emit('dom-ready');
    await vi.runAllTimersAsync();

    await vi.waitFor(() => {
      expect(fs.existsSync(path.join(os.tmpdir(), 'foliole-test-logs', 'renderer-state.ndjson'))).toBe(true);
    });
    const records = fs
      .readFileSync(path.join(os.tmpdir(), 'foliole-test-logs', 'renderer-state.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { label: string; snapshot: unknown });
    const record = records.find((entry) => entry.label === 'dom-ready');

    expect(record?.snapshot).toEqual({
      bodyTextSample: '[redacted-body-sample]',
      href: '[redacted-url]',
      message: 'Failed at [redacted-path]',
      readyState: 'complete'
    });
  });
});
