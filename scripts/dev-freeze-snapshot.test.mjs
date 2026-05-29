// @vitest-environment node

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildFreezeSnapshot, buildLightSample } from './dev-freeze-snapshot.mjs';

describe('dev freeze snapshot', () => {
  it('captures system, process, preview, and resource lock evidence', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'freeze-snapshot-'));
    await writeFile(path.join(runtimeDir, 'windows-preview.state.json'), JSON.stringify({
      acceptingUntil: 12_000,
      runs: {
        active: { driverPid: -1, runId: 'active', startedAt: 9_000, status: 'running', waiters: ['a'] }
      },
      activeRunId: 'active'
    }), 'utf8');
    await writeFile(path.join(runtimeDir, 'resource-gate.preview.lock'), JSON.stringify({
      className: 'preview',
      pid: -1,
      resource: 'preview',
      schemaVersion: 1,
      startedAt: 9_000
    }), 'utf8');

    const snapshot = await buildFreezeSnapshot({ now: new Date(10_000), runtimeDir });

    expect(snapshot.preview.activeRun).toMatchObject({ runId: 'active', status: 'running' });
    expect(snapshot.resourceLocks).toHaveLength(1);
    expect(snapshot.processes.topCpu[0]).toContain('PID');
    expect(snapshot.memory).toContain('Mem:');
    expect(snapshot.git.statusShort).toEqual(expect.any(String));
    await expect(readFile(path.join(runtimeDir, 'resource-gate.preview.lock'), 'utf8')).resolves.toContain('preview');
  });

  it('keeps watch samples light by omitting git state', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'freeze-sample-'));

    const sample = await buildLightSample({ now: new Date(10_000), runtimeDir });

    expect(sample).not.toHaveProperty('git');
    expect(sample.loadAverage.length).toBeGreaterThan(0);
    expect(sample.processes.topCpu[0]).toContain('PID');
  });
});
