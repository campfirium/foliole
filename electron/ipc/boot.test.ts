import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  appendMainProcessDiagnosticLog: vi.fn(),
  originalWorkdir: process.env.FOLIOLE_WORKDIR,
  originalHead: process.env.FOLIOLE_RUNTIME_HEAD,
  originalSession: process.env.FOLIOLE_BOOT_SESSION,
  originalArgv: [...process.argv]
}));

vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: state.appendMainProcessDiagnosticLog
}));

import { appendBootEvent, bootReport, flushBootEvents, resolveBootArtifactPaths } from './boot.js';

afterEach(() => {
  process.env.FOLIOLE_WORKDIR = state.originalWorkdir;
  process.env.FOLIOLE_RUNTIME_HEAD = state.originalHead;
  process.env.FOLIOLE_BOOT_SESSION = state.originalSession;
  process.argv = [...state.originalArgv];
  state.appendMainProcessDiagnosticLog.mockReset();
});

it('writes main startup events and marks the source', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-boot-main-'));
  process.env.FOLIOLE_WORKDIR = repoRoot;
  process.env.FOLIOLE_RUNTIME_HEAD = 'head-1';
  process.env.FOLIOLE_BOOT_SESSION = 'session-1';

  await appendBootEvent('main_window_create_start', { step: 'create-window' });
  await flushBootEvents();

  const paths = resolveBootArtifactPaths(repoRoot);
  const rawLog = fs.readFileSync(paths.eventLogPath, 'utf8').trim().split('\n');
  expect(rawLog).toHaveLength(1);
  expect(JSON.parse(rawLog[0] ?? '{}')).toMatchObject({
    head: 'head-1',
    payload: { step: 'create-window' },
    session: 'session-1',
    source: 'main',
    stage: 'main_window_create_start'
  });
});

it('preserves non-marker boot event order through the async queue', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-boot-order-'));
  process.env.FOLIOLE_WORKDIR = repoRoot;

  await appendBootEvent('stage_a');
  await appendBootEvent('stage_b');
  await appendBootEvent('stage_c');
  await flushBootEvents();

  const paths = resolveBootArtifactPaths(repoRoot);
  const stages = fs.readFileSync(paths.eventLogPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { stage: string })
    .map((event) => event.stage);
  expect(stages).toEqual(['stage_a', 'stage_b', 'stage_c']);
});

it('writes renderer boot events and app ready marker', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-boot-renderer-'));
  process.env.FOLIOLE_WORKDIR = repoRoot;
  process.env.FOLIOLE_RUNTIME_HEAD = 'head-2';
  process.env.FOLIOLE_BOOT_SESSION = 'session-2';

  await bootReport('app_ready', { source: 'timeout_1500ms' });

  const paths = resolveBootArtifactPaths(repoRoot);
  const marker = JSON.parse(fs.readFileSync(paths.readyMarkerPath, 'utf8'));
  expect(marker).toMatchObject({
    head: 'head-2',
    payload: { source: 'timeout_1500ms' },
    session: 'session-2',
    source: 'renderer',
    stage: 'app_ready'
  });
});

it('writes a window visible marker for native preview health checks', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-boot-window-visible-'));
  process.env.FOLIOLE_WORKDIR = repoRoot;
  process.env.FOLIOLE_BOOT_SESSION = 'session-window';

  await appendBootEvent('window_visible', { isVisible: true });

  const paths = resolveBootArtifactPaths(repoRoot);
  const marker = JSON.parse(fs.readFileSync(paths.windowVisibleMarkerPath, 'utf8'));
  expect(marker).toMatchObject({
    payload: { isVisible: true },
    session: 'session-window',
    source: 'main',
    stage: 'window_visible'
  });
});

it('prefers explicit relaunch boot session args over stale environment session', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-boot-session-arg-'));
  process.env.FOLIOLE_WORKDIR = repoRoot;
  process.env.FOLIOLE_BOOT_SESSION = 'old-session';
  process.argv = [...state.originalArgv, '--foliole-boot-session=new-session'];

  await bootReport('app_ready', { source: 'relaunch' });

  const paths = resolveBootArtifactPaths(repoRoot);
  const marker = JSON.parse(fs.readFileSync(paths.readyMarkerPath, 'utf8'));
  expect(marker.session).toBe('new-session');
});
