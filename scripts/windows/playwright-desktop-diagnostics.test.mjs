// @vitest-environment node

import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectDesktopFailureDiagnostics,
  createMainProcessLogCollector,
  createRendererConsoleCollector
} from './playwright-desktop-diagnostics.mjs';

class MockPage extends EventEmitter {
  constructor(snapshot, runtimeState = {}) {
    super();
    this.snapshot = snapshot;
    this.runtimeState = runtimeState;
  }

  async evaluate(pageFunction, appReadyFlag) {
    if (appReadyFlag) {
      globalThis[appReadyFlag] = this.runtimeState.appReady ?? false;
      globalThis.location = { href: this.runtimeState.rendererUrl ?? 'about:blank' };
      globalThis.document = { readyState: this.runtimeState.readyState ?? 'loading' };
      return pageFunction(appReadyFlag);
    }
    globalThis.__FOLIOLE_DESKTOP_DEBUG_PROBE__ = {
      getSnapshot: () => this.snapshot
    };
    return pageFunction();
  }
}

describe('playwright desktop diagnostics', () => {
  it('collects current runtime readiness, preload path, renderer URL, and bridge availability for the active pid', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-diagnostics-test-'));
    try {
      const logsDir = path.join(tempRoot, 'logs', 'windows');
      await mkdir(logsDir, { recursive: true });
      await writeFile(
        path.join(tempRoot, '.windows-native-boot-ready.json'),
        JSON.stringify({ pid: 4821, stage: 'app_ready', timestamp: '2026-03-14T00:00:00.000Z' }),
        'utf8'
      );
      await writeFile(
        path.join(logsDir, 'native-boot-events.ndjson'),
        `${JSON.stringify({ stage: 'boot_start' })}\n${JSON.stringify({ stage: 'app_ready' })}\n`,
        'utf8'
      );

      const windowPage = new MockPage({
        bridgeAvailable: false,
        preloadPath: '/workspace/foliole/electron/preload.cjs',
        recentInvokeFailures: [],
        recentInvokes: [{ command: 'resolve_app_paths', status: 'resolved', timestamp: 'now', durationMs: 4 }],
        runtimeHead: 'head-123'
      }, {
        appReady: true,
        readyState: 'complete',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      const rendererConsoleCollector = createRendererConsoleCollector(windowPage);
      const childProcess = {
        pid: 4821,
        stderr: new EventEmitter(),
        stdout: new EventEmitter()
      };
      const mainProcessCollector = createMainProcessLogCollector(childProcess);

      windowPage.emit('console', {
        location: () => ({ columnNumber: 0, lineNumber: 10, url: 'app://index.html' }),
        text: () => 'renderer exploded',
        type: () => 'error'
      });
      childProcess.stdout.emit('data', Buffer.from('main ok\n'));
      childProcess.stderr.emit('data', Buffer.from('main failed\n'));

      const diagnostics = await collectDesktopFailureDiagnostics({
        appRoot: tempRoot,
        mainProcessCollector,
        rendererConsoleCollector,
        windowPage
      });

      expect(diagnostics.bridgeBreakpoint).toEqual({
        kind: 'preload_not_executed',
        mainProcessPid: 4821,
        readyMarkerPid: 4821,
        visibleWindow: true
      });
      expect(diagnostics.currentRuntime).toEqual({
        appReady: true,
        bridgeAvailable: false,
        pid: 4821,
        preloadPath: '/workspace/foliole/electron/preload.cjs',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      expect(diagnostics.runtimeHead).toBe('head-123');
      expect(diagnostics.nativeInvokeHistory).toEqual([
        expect.objectContaining({ command: 'resolve_app_paths', status: 'resolved' })
      ]);
      expect(diagnostics.rendererConsole).toEqual([
        expect.objectContaining({ text: 'renderer exploded', type: 'error' })
      ]);
      expect(diagnostics.mainProcessLogs.stdoutTail).toEqual(['main ok\n']);
      expect(diagnostics.mainProcessLogs.stderrTail).toEqual(['main failed\n']);
      expect(diagnostics.boot.readyMarker).toEqual({
        pid: 4821,
        stage: 'app_ready',
        timestamp: '2026-03-14T00:00:00.000Z'
      });
      expect(diagnostics.boot.bootEvents).toEqual([{ stage: 'boot_start' }, { stage: 'app_ready' }]);

      rendererConsoleCollector.dispose();
      mainProcessCollector.dispose();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('distinguishes a visible window with no bridge from a renderer startup failure when an older single-instance window holds the lock', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-diagnostics-test-'));
    try {
      await mkdir(path.join(tempRoot, 'logs', 'windows'), { recursive: true });
      await writeFile(
        path.join(tempRoot, '.windows-native-boot-ready.json'),
        JSON.stringify({ pid: 9911, stage: 'app_ready', timestamp: '2026-03-14T00:00:00.000Z' }),
        'utf8'
      );

      const windowPage = new MockPage(null, {
        appReady: true,
        readyState: 'complete',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      const rendererConsoleCollector = createRendererConsoleCollector(windowPage);
      const mainProcessCollector = createMainProcessLogCollector({
        pid: 4821,
        stderr: new EventEmitter(),
        stdout: new EventEmitter()
      });

      const diagnostics = await collectDesktopFailureDiagnostics({
        appRoot: tempRoot,
        mainProcessCollector,
        rendererConsoleCollector,
        windowPage
      });

      expect(diagnostics.bridgeAvailable).toBe(null);
      expect(diagnostics.currentRuntime).toEqual({
        appReady: true,
        bridgeAvailable: null,
        pid: 4821,
        preloadPath: null,
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      expect(diagnostics.bridgeBreakpoint).toEqual({
        kind: 'single_instance_old_window_lock',
        mainProcessPid: 4821,
        readyMarkerPid: 9911,
        visibleWindow: true
      });

      rendererConsoleCollector.dispose();
      mainProcessCollector.dispose();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
