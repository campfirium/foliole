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
  constructor(snapshot) {
    super();
    this.snapshot = snapshot;
  }

  async evaluate(pageFunction) {
    globalThis.__FOLIOLE_DESKTOP_DEBUG_PROBE__ = {
      getSnapshot: () => this.snapshot
    };
    return pageFunction();
  }
}

describe('playwright desktop diagnostics', () => {
  it('collects renderer, main-process, boot, and invoke diagnostics', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-diagnostics-test-'));
    try {
      const logsDir = path.join(tempRoot, 'logs', 'windows');
      await mkdir(logsDir, { recursive: true });
      await writeFile(
        path.join(tempRoot, '.windows-native-boot-ready.json'),
        JSON.stringify({ stage: 'app_ready', timestamp: '2026-03-14T00:00:00.000Z' }),
        'utf8'
      );
      await writeFile(
        path.join(logsDir, 'native-boot-events.ndjson'),
        `${JSON.stringify({ stage: 'boot_start' })}\n${JSON.stringify({ stage: 'app_ready' })}\n`,
        'utf8'
      );

      const windowPage = new MockPage({
        bridgeAvailable: true,
        recentInvokeFailures: [],
        recentInvokes: [{ command: 'resolve_app_paths', status: 'resolved', timestamp: 'now', durationMs: 4 }],
        runtimeHead: 'head-123'
      });
      const rendererConsoleCollector = createRendererConsoleCollector(windowPage);
      const childProcess = {
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
});
