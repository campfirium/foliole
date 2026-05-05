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
  createRendererConsoleCollector,
  createRendererPageEventCollector
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
      globalThis.__FOLIOLE_BRIDGE_READY_REPORTED__ = this.runtimeState.bridgeReady ?? false;
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
      await writeFile(
        path.join(logsDir, 'renderer-state.ndjson'),
        `${JSON.stringify({ label: 'did-finish-load', snapshot: {
          bridgeAvailable: false,
          href: 'file:///workspace/foliole/dist/index.html',
          readyState: 'complete',
          rootPresent: true
        } })}\n`,
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
      const rendererPageEventCollector = createRendererPageEventCollector(windowPage);
      const childProcess = {
        pid: 4821,
        stderr: new EventEmitter(),
        stdout: new EventEmitter()
      };
      const mainProcessCollector = createMainProcessLogCollector(childProcess);

      windowPage.emit('framenavigated', {
        parentFrame: () => null,
        url: () => 'file:///workspace/foliole/dist/index.html'
      });
      windowPage.emit('domcontentloaded');
      windowPage.emit('response', {
        ok: () => true,
        status: () => 200,
        url: () => 'file:///workspace/foliole/dist/index.html'
      });
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
        rendererPageEventCollector,
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
        bridgeReady: false,
        navigationReady: true,
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
      expect(diagnostics.rendererPage).toEqual({
        bodyTextSample: '',
        pageUrl: null,
        readyState: 'complete',
        rootPresent: false,
        title: null,
        url: 'file:///workspace/foliole/dist/index.html'
      });
      expect(diagnostics.rendererPageEvents).toEqual([
        expect.objectContaining({ type: 'framenavigated', url: 'file:///workspace/foliole/dist/index.html' }),
        expect.objectContaining({ type: 'domcontentloaded' }),
        expect.objectContaining({ ok: true, status: 200, type: 'response', url: 'file:///workspace/foliole/dist/index.html' })
      ]);
      expect(diagnostics.mainProcessLogs.stdoutTail).toEqual(['main ok\n']);
      expect(diagnostics.mainProcessLogs.stderrTail).toEqual(['main failed\n']);
      expect(diagnostics.boot.readyMarker).toEqual({
        pid: 4821,
        stage: 'app_ready',
        timestamp: '2026-03-14T00:00:00.000Z'
      });
      expect(diagnostics.boot.bridgeReadyMarker).toBeNull();
      expect(diagnostics.boot.bootEvents).toEqual([{ stage: 'boot_start' }, { stage: 'app_ready' }]);
      expect(diagnostics.rendererRuntime).toEqual({
        appReady: true,
        bridgeReady: false,
        readyState: 'complete',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      expect(diagnostics.rendererState).toEqual({
        entries: [
          expect.objectContaining({
            label: 'did-finish-load',
            snapshot: expect.objectContaining({
              bridgeAvailable: false,
              href: 'file:///workspace/foliole/dist/index.html',
              readyState: 'complete',
              rootPresent: true
            })
          })
        ],
        latestSnapshot: {
          bridgeAvailable: false,
          href: 'file:///workspace/foliole/dist/index.html',
          readyState: 'complete',
          rootPresent: true
        },
        logPath: path.join(logsDir, 'renderer-state.ndjson'),
        navigationReady: true
      });

      rendererConsoleCollector.dispose();
      rendererPageEventCollector.dispose();
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
      const rendererPageEventCollector = createRendererPageEventCollector(windowPage);
      const mainProcessCollector = createMainProcessLogCollector({
        pid: 4821,
        stderr: new EventEmitter(),
        stdout: new EventEmitter()
      });

      const diagnostics = await collectDesktopFailureDiagnostics({
        appRoot: tempRoot,
        mainProcessCollector,
        rendererPageEventCollector,
        rendererConsoleCollector,
        windowPage
      });

      expect(diagnostics.bridgeAvailable).toBe(null);
      expect(diagnostics.currentRuntime).toEqual({
        appReady: true,
        bridgeAvailable: null,
        bridgeReady: false,
        navigationReady: true,
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
      rendererPageEventCollector.dispose();
      mainProcessCollector.dispose();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('marks bridge readiness only after the current runtime writes bridge_ready and the renderer reports the bridge flag', async () => {
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
        path.join(tempRoot, '.windows-native-bridge-ready.json'),
        JSON.stringify({ pid: 4821, stage: 'bridge_ready', timestamp: '2026-03-14T00:00:01.000Z' }),
        'utf8'
      );
      await writeFile(
        path.join(logsDir, 'renderer-state.ndjson'),
        `${JSON.stringify({ label: 'after-1000ms', snapshot: {
          bridgeAvailable: true,
          href: 'file:///workspace/foliole/dist/index.html',
          readyState: 'complete',
          rootPresent: true
        } })}\n`,
        'utf8'
      );

      const windowPage = new MockPage({
        bridgeAvailable: true,
        preloadPath: '/workspace/foliole/electron/preload.cjs',
        runtimeHead: 'head-456'
      }, {
        appReady: true,
        bridgeReady: true,
        readyState: 'complete',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      const rendererConsoleCollector = createRendererConsoleCollector(windowPage);
      const rendererPageEventCollector = createRendererPageEventCollector(windowPage);
      const mainProcessCollector = createMainProcessLogCollector({
        pid: 4821,
        stderr: new EventEmitter(),
        stdout: new EventEmitter()
      });

      const diagnostics = await collectDesktopFailureDiagnostics({
        appRoot: tempRoot,
        mainProcessCollector,
        rendererPageEventCollector,
        rendererConsoleCollector,
        windowPage
      });

      expect(diagnostics.currentRuntime).toEqual({
        appReady: true,
        bridgeAvailable: true,
        bridgeReady: true,
        navigationReady: true,
        pid: 4821,
        preloadPath: '/workspace/foliole/electron/preload.cjs',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      expect(diagnostics.boot.bridgeReadyMarker).toEqual({
        pid: 4821,
        stage: 'bridge_ready',
        timestamp: '2026-03-14T00:00:01.000Z'
      });
      expect(diagnostics.rendererRuntime).toEqual({
        appReady: true,
        bridgeReady: true,
        readyState: 'complete',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      });
      expect(diagnostics.rendererState.navigationReady).toBe(true);

      rendererConsoleCollector.dispose();
      rendererPageEventCollector.dispose();
      mainProcessCollector.dispose();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
