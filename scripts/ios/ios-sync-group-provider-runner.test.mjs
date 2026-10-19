// @vitest-environment node
/* global process */
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { compileSyncGroupProvider, stopSyncGroupProvider } from './ios-sync-group-provider-runner.mjs';

it('preserves the first shutdown failure without sending to a killed provider again', async () => {
  vi.useFakeTimers();
  const service = Object.assign(new EventEmitter(), {
    exitCode: null, signalCode: null, send: vi.fn(), kill: vi.fn()
  });
  try {
    const stopped = stopSyncGroupProvider(service);
    const rejection = expect(stopped).rejects.toThrow('iOS hosted provider did not stop cleanly.');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    const repeated = expect(stopSyncGroupProvider(service)).rejects.toThrow('iOS hosted provider did not stop cleanly.');
    await vi.advanceTimersByTimeAsync(10_000);
    await repeated;
    expect(service.send).toHaveBeenCalledTimes(1);
    expect(service.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  } finally { vi.useRealTimers(); }
});

it('compiles the request provider and its runtime dependencies', () => {
  const outputDirectory = '.tmp/artifacts/ios-sync-group-provider-distribution-test';
  fs.rmSync(outputDirectory, { force: true, recursive: true });
  try {
    compileSyncGroupProvider(process.cwd(), outputDirectory);
    const distributionRoot = path.join(outputDirectory, 'service-dist');
    expect(fs.existsSync(path.join(
      distributionRoot, 'scripts/ios/ios-sync-group-provider-fixture.js'
    ))).toBe(true);
    expect(fs.existsSync(path.join(distributionRoot, 'scripts/ios/ios-hosted-state-writeback-facts.mjs'))).toBe(true);

  } finally {
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
}, 30_000);
