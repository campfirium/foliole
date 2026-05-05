import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { appendBootEvent, bootReport, resolveBootArtifactPaths } from './boot.js';

const env = vi.hoisted(() => ({
  originalWorkdir: process.env.FOLIOLE_WORKDIR,
  originalHead: process.env.FOLIOLE_RUNTIME_HEAD,
  originalSession: process.env.FOLIOLE_BOOT_SESSION
}));

afterEach(() => {
  process.env.FOLIOLE_WORKDIR = env.originalWorkdir;
  process.env.FOLIOLE_RUNTIME_HEAD = env.originalHead;
  process.env.FOLIOLE_BOOT_SESSION = env.originalSession;
});

it('writes main startup events and marks the source', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-boot-main-'));
  process.env.FOLIOLE_WORKDIR = repoRoot;
  process.env.FOLIOLE_RUNTIME_HEAD = 'head-1';
  process.env.FOLIOLE_BOOT_SESSION = 'session-1';

  await appendBootEvent('main_window_create_start', { step: 'create-window' });

  const paths = resolveBootArtifactPaths(repoRoot);
  const rawLog = fs.readFileSync(paths.eventLogPath, 'utf8').trim().split('\n');
  expect(rawLog).toHaveLength(1);
  expect(JSON.parse(rawLog[0])).toMatchObject({
    head: 'head-1',
    payload: { step: 'create-window' },
    session: 'session-1',
    source: 'main',
    stage: 'main_window_create_start'
  });
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
