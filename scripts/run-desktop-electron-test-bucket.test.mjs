// @vitest-environment node

import { expect, it } from 'vitest';

import { buildDesktopElectronBuckets } from './run-desktop-electron-test-bucket.mjs';

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
});

it('keeps script tests limited to electron-named script files', () => {
  const scripts = buildDesktopElectronBuckets().find((bucket) => bucket.label === 'scripts');

  expect(scripts?.targets).toContain('scripts/electron-dev.test.mjs');
  expect(scripts?.targets).toContain('scripts/windows/electron-native-health-check.test.mjs');
  expect(scripts?.targets).not.toContain('scripts/windows/package-windows.test.mjs');
});
