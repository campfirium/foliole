// @vitest-environment node
/* global AbortController */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertConvergedConflictTrace, createStateSignals
} from './macos-fri-two-device-sync.mjs';
import { createFriProviderStageRunner } from './fri-provider-stage.mjs';

describe('Mac and Fri provider state signals', () => {
  it('rejects an active and future wait when the provider fails', async () => {
    const signals = createStateSignals();
    const active = signals.waitFor('automatic-converged', 1_000);
    const failure = new Error('provider stopped');

    signals.fail(failure);

    await expect(active).rejects.toBe(failure);
    await expect(signals.waitFor('ready', 1_000)).rejects.toBe(failure);
  });

  it('fails a stage at its own deadline', async () => {
    const signals = createStateSignals();

    await expect(signals.waitFor('automatic-converged', 5)).rejects.toThrow(
      'Timed out waiting for provider state: automatic-converged'
    );
  });

  it('records a provider stage failure at its own deadline', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-fri-stage-'));
    const filePath = path.join(root, 'progress.jsonl');
    const runStage = createFriProviderStageRunner({ filePath });

    await expect(runStage('publish', () => new Promise(() => {}), 5))
      .rejects.toThrow('Fri provider stage timed out: publish');

    const records = fs.readFileSync(filePath, 'utf8').trim().split('\n').map(JSON.parse);
    expect(records.map(({ status }) => status)).toEqual(['started', 'failed']);
    expect(records[1]).toMatchObject({ name: 'publish',
      error: 'Fri provider stage timed out: publish' });
  });

  it('propagates consumer cancellation into an active provider stage', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-fri-abort-'));
    const controller = new AbortController();
    const runStage = createFriProviderStageRunner({
      filePath: path.join(root, 'progress.jsonl'), signal: controller.signal
    });
    const active = runStage('converge', () => new Promise(() => {}));

    controller.abort(new Error('consumer stopped'));

    await expect(active).rejects.toThrow('consumer stopped');
  });
});

it('requires both concurrent parents behind the Fri converged version', () => {
  const projection = { conflict_versions: [
    { content_hash: 'fri-hash', forks: ['fri'], is_current: false,
      object_id: 'node-1', parents: ['base'], version_id: 'fri' },
    { content_hash: 'mac-hash', forks: ['macos'], is_current: false,
      object_id: 'node-1', parents: ['base'], version_id: 'mac' },
    { content_hash: 'merged-hash', forks: ['fri', 'macos'], is_current: true,
      object_id: 'node-1', parents: ['fri', 'mac'], version_id: 'merged' }
  ] };

  expect(assertConvergedConflictTrace(projection)).toEqual({
    contentHash: 'merged-hash', objectId: 'node-1', parents: ['fri', 'mac'],
    versionId: 'merged'
  });
});

it('publishes the Fri fork before releasing the Mac fork', () => {
  const source = fs.readFileSync('scripts/ios/macos-fri-two-device-sync.mjs', 'utf8');

  expect(source.indexOf("if (conflictPublish.code !== 0)"))
    .toBeLessThan(source.indexOf("releaseGate.release('consumer_complete')"));
});
