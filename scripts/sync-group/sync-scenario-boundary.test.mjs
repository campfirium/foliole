// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

it('keeps the stable predicate independent of qualification, latest and fixed waits', () => {
  const predicate = read('scripts/sync-group/sync-scenario-predicate.mjs');
  for (const forbidden of ['90_000', 'latest', 'attention', 'credential', 'integrity',
    'nodeCount', 'syncGroupId']) {
    expect(predicate).not.toContain(forbidden);
  }
});

it('does not clear A5 or use pairing recovery as existing-sync success', () => {
  const fresh = read('scripts/sync-group/multi-device-sync-fresh-join.mjs');
  const extended = read('scripts/android/macos-a5-extended-actions.mjs');
  const existing = exportedFunction(extended, 'runMacosA5ExistingSyncEntry');
  expect(fresh).not.toContain("action: 'clear-app-data'");
  expect(existing).not.toContain('runMacosA5PairSync');
  expect(existing).not.toContain('90_000');
});

it('keeps existing-sync terminal proof on exact facts instead of a fixed settle', () => {
  const existing = read('scripts/android/macos-a5-existing-sync-acceptance.mjs');
  expect(existing).toContain('assertBidirectionalConvergence');
  expect(existing).not.toContain('90_000');
  expect(existing).not.toContain('latestSyncRun');
});
