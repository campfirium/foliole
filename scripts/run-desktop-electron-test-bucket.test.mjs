// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

import {
  assertDesktopElectronBucketCoverage,
  buildDesktopElectronBuckets,
  buildDesktopElectronShardBuckets,
  DESKTOP_ELECTRON_SHARDS,
  collectElectronTestFiles
} from './run-desktop-electron-test-bucket.mjs';

it('splits desktop Electron tests into bounded buckets', () => {
  const buckets = buildDesktopElectronBuckets();
  const labels = buckets.map((bucket) => bucket.label);

  expect(labels).toContain('database-01');
  expect(labels).toContain('import-importManagerSettings');
  expect(labels).toContain('import-importNodeMutationPatch');
  expect(labels).toContain('import-01');
  expect(labels).toContain('ipc-epub-01');
  expect(labels).toContain('ipc-01');
  expect(labels).toContain('attachments');
  expect(labels).toContain('sync');
  expect(labels).toContain('mirror');
  expect(labels).toContain('diagnostics');
  expect(labels).toContain('agentControl');
  expect(labels).toContain('assistant');
  expect(labels).toContain('discourse');
  expect(labels).toContain('foliole-publish');
  expect(labels).toContain('security');
  expect(labels).toContain('update');
  expect(labels).toContain('wordpress');
  expect(labels).toContain('root');
  expect(labels).toContain('scripts');
  expect(buckets.every((bucket) => bucket.targets.length > 0)).toBe(true);
  expect(buckets.find((bucket) => bucket.label === 'database-01')?.targets.length).toBeLessThanOrEqual(5);
  expect(buckets.find((bucket) => bucket.label === 'ipc-01')?.targets.length).toBeLessThanOrEqual(10);
  expect(buckets.find((bucket) => bucket.label === 'import-importManagerSettings')?.targets).toEqual([
    'electron/import/importManagerSettings.test.ts'
  ]);
  expect(buckets.find((bucket) => bucket.label === 'import-importManagerSettings')?.workers).toBe(1);
  expect(buckets.find((bucket) => bucket.label === 'import-importNodeMutationPatch')?.targets).toEqual([
    'electron/import/importNodeMutationPatch.test.ts'
  ]);
  expect(buckets.find((bucket) => bucket.label === 'import-importNodeMutationPatch')?.workers).toBe(1);
  expect(buckets.find((bucket) => bucket.label === 'ipc-epub-01')?.targets.length).toBeLessThanOrEqual(3);
  expect(buckets.find((bucket) => bucket.label === 'agentControl')?.targets).toHaveLength(16);
  expect(buckets.find((bucket) => bucket.label === 'assistant')?.targets).toHaveLength(19);
  expect(buckets.find((bucket) => bucket.label === 'discourse')?.targets).toHaveLength(4);
  expect(buckets.find((bucket) => bucket.label === 'foliole-publish')?.targets).toHaveLength(13);
  expect(buckets.find((bucket) => bucket.label === 'security')?.targets).toHaveLength(1);
  expect(buckets.find((bucket) => bucket.label === 'update')?.targets).toHaveLength(6);
  expect(buckets.find((bucket) => bucket.label === 'wordpress')?.targets).toHaveLength(6);
});

it('collects every Electron test exactly once', () => {
  expect(() => assertDesktopElectronBucketCoverage(
    collectElectronTestFiles(),
    buildDesktopElectronBuckets()
  )).not.toThrow();
});

it('partitions every Electron bucket into one hosted shard', () => {
  const buckets = buildDesktopElectronBuckets();
  const sharded = DESKTOP_ELECTRON_SHARDS.flatMap((shard) => (
    buildDesktopElectronShardBuckets(shard, buckets)
  ));

  expect(sharded.map(({ label }) => label).sort())
    .toEqual(buckets.map(({ label }) => label).sort());
  expect(new Set(sharded.map(({ label }) => label)).size).toBe(buckets.length);
  expect(DESKTOP_ELECTRON_SHARDS.every((shard) => (
    buildDesktopElectronShardBuckets(shard, buckets).length > 0
  ))).toBe(true);
});

it('uses fork workers for Electron native modules', () => {
  const source = fs.readFileSync('scripts/run-desktop-electron-test-bucket.mjs', 'utf8');
  expect(source).toContain("'--pool=forks'");
  expect(source).not.toContain("'--pool=threads'");
});

it('fails with the missing Electron test path', () => {
  expect(() => assertDesktopElectronBucketCoverage(
    ['electron/new-domain/unrouted.test.ts'],
    []
  )).toThrow(/missing:[\s\S]*electron\/new-domain\/unrouted\.test\.ts/u);
});

it('fails with the duplicated Electron test path', () => {
  const target = 'electron/assistant/duplicated.test.ts';
  const buckets = [
    { label: 'first', targets: [target] },
    { label: 'second', targets: [target] }
  ];

  expect(() => assertDesktopElectronBucketCoverage([target], buckets))
    .toThrow(/duplicate:[\s\S]*electron\/assistant\/duplicated\.test\.ts/u);
});

it('keeps script tests limited to electron-named script files', () => {
  const scripts = buildDesktopElectronBuckets().find((bucket) => bucket.label === 'scripts');

  expect(scripts?.targets).toContain('scripts/electron-dev.test.mjs');
  expect(scripts?.targets).toContain('scripts/windows/electron-native-health-check.test.mjs');
  expect(scripts?.targets).not.toContain('scripts/windows/package-windows.test.mjs');
});
