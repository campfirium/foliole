// @vitest-environment node

import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  readElectronDevSnapshot,
  resolveElectronDevArtifactPaths,
  waitForElectronDevCondition,
  writeElectronDevClientState
} from './electron-dev-control-state.mjs';

async function writeMarker(filePath, stage, session, payload = {}) {
  await writeFile(filePath, `${JSON.stringify({ payload, pid: 42, session, stage })}\n`, 'utf8');
}

describe('Electron dev control state', () => {
  it('trusts only a live client and three same-session ready markers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'electron-dev-state-'));
    const paths = resolveElectronDevArtifactPaths(root);
    await writeElectronDevClientState(paths, { shellPid: 41, supervisorPid: 40 });
    await writeMarker(paths.appReadyFile, 'app_ready', 'session-a');
    await writeMarker(paths.bridgeReadyFile, 'bridge_ready', 'session-a', { bridgeAvailable: true });
    await writeMarker(paths.windowVisibleFile, 'window_visible', 'session-a', { isVisible: true });

    expect(readElectronDevSnapshot(paths, () => true).running).toBe(true);
    await writeMarker(paths.windowVisibleFile, 'window_visible', 'session-b', { isVisible: true });
    expect(readElectronDevSnapshot(paths, () => true).running).toBe(false);
  });

  it('waits on file events and closes the watcher after the condition changes', async () => {
    const emitter = new EventEmitter();
    emitter.close = vi.fn();
    let ready = false;
    let notify = null;
    const result = waitForElectronDevCondition({
      evaluate: () => ready && { ok: true },
      label: 'event state',
      stateRoot: '/state',
      timeoutMs: 1000,
      watch: (_root, callback) => {
        notify = callback;
        return emitter;
      }
    });
    ready = true;
    notify();

    await expect(result).resolves.toEqual({ ok: true });
    expect(emitter.close).toHaveBeenCalledOnce();
  });
});
