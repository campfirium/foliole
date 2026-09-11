// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

import { assertWindowsConflictTrace } from './windows-fri-two-device-sync.mjs';

it('requires both real peer forks in the Fri conflict projection', () => {
  const projection = { conflict_versions: [
    { forks: ['windows'], is_current: false, object_id: 'topic', parents: ['base'],
      version_id: 'windows-version' },
    { forks: ['fri'], is_current: false, object_id: 'topic', parents: ['base'],
      version_id: 'fri-version' },
    { content_hash: 'merged', forks: ['fri', 'windows'], is_current: true, object_id: 'topic',
      parents: ['windows-version', 'fri-version'], version_id: 'merged-version' }
  ] };

  expect(assertWindowsConflictTrace(projection)).toEqual({
    contentHash: 'merged', objectId: 'topic', parents: ['windows-version', 'fri-version'],
    versionId: 'merged-version'
  });
  expect(() => assertWindowsConflictTrace({ conflict_versions: projection.conflict_versions.slice(0, 2) }))
    .toThrow('two-parent conflict version');
});

it('keeps the Windows anchor alive through Fri publish, pull, and restart verification', () => {
  const source = fs.readFileSync('scripts/ios/windows-fri-two-device-sync.mjs', 'utf8');
  const fork = source.indexOf("test: 'testForksTwoDeviceConflict'");
  const firstRelease = source.indexOf("provider.release('consumer_complete')", fork);
  const resumed = source.indexOf("provider.waitForProgress('conflict-sync-resumed')", firstRelease);
  const publish = source.indexOf("test: 'testPublishesTwoDeviceConflictFork'", resumed);
  const restarted = source.indexOf("provider.waitForProgress('restarted')", publish);
  const pull = source.indexOf("test: 'testPullsTwoDeviceConflictAfterProviderConverges'", restarted);
  const verify = source.indexOf("test: 'testVerifiesTwoDeviceConflictAfterProviderConverges'", pull);
  const secondRelease = source.indexOf("provider.release('consumer_complete')", firstRelease + 1);

  expect([fork, firstRelease, resumed, publish, restarted, pull, verify, secondRelease])
    .toEqual([...new Set([fork, firstRelease, resumed, publish, restarted, pull, verify, secondRelease])]
      .sort((left, right) => left - right));
  expect(source).toContain("FOLIOLE_T152_DESKTOP_FORK_LABEL: 'windows'");
});
