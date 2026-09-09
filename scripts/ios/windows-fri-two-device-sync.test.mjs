// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

import { assertWindowsConflictTrace } from './windows-fri-two-device-sync.mjs';

it('requires both real peer forks in the Fri conflict projection', () => {
  const projection = { conflict_versions: [
    { forks: ['fri'], object_id: 'topic', version_id: 'fri-version' },
    { forks: ['windows'], object_id: 'topic', version_id: 'windows-version' }
  ] };

  expect(assertWindowsConflictTrace(projection)).toEqual({
    friVersionIds: ['fri-version'], objectId: 'topic', windowsVersionIds: ['windows-version']
  });
  expect(() => assertWindowsConflictTrace({ conflict_versions: projection.conflict_versions.slice(0, 1) }))
    .toThrow('both Windows and Fri concurrent versions');
});

it('keeps the Windows anchor alive through Fri publish, pull, and restart verification', () => {
  const source = fs.readFileSync('scripts/ios/windows-fri-two-device-sync.mjs', 'utf8');
  const fork = source.indexOf("test: 'testForksTwoDeviceConflict'");
  const firstRelease = source.indexOf("provider.release('consumer_complete')", fork);
  const publish = source.indexOf("test: 'testPublishesTwoDeviceConflictFork'", firstRelease);
  const restarted = source.indexOf("provider.waitForProgress('restarted')", publish);
  const pull = source.indexOf("test: 'testPullsTwoDeviceConflictAfterProviderConverges'", restarted);
  const verify = source.indexOf("test: 'testVerifiesTwoDeviceConflictAfterProviderConverges'", pull);
  const secondRelease = source.indexOf("provider.release('consumer_complete')", firstRelease + 1);

  expect([fork, firstRelease, publish, restarted, pull, verify, secondRelease])
    .toEqual([...new Set([fork, firstRelease, publish, restarted, pull, verify, secondRelease])]
      .sort((left, right) => left - right));
  expect(source).toContain("FOLIOLE_T152_DESKTOP_FORK_LABEL: 'windows'");
});
