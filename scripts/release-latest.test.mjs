// @vitest-environment node

import { expect, it } from 'vitest';

import { markManifestLatestRelease } from './release-latest.mjs';
import { createFixture } from './release-doctor.test-support.mjs';

function runner(version, calls, latest = '0.8.0') {
  let latestVersion = latest;
  return (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('--latest=true')) {
      latestVersion = version;
      return '';
    }
    if (args[2] === `v${version}`) {
      return JSON.stringify({
        isDraft: false,
        isPrerelease: false,
        publishedAt: '2026-08-11T09:40:36Z',
        tagName: `v${version}`
      });
    }
    return JSON.stringify({ tagName: `v${latestVersion}` });
  };
}

it('marks the public manifest version as GitHub Latest without editing release content', async () => {
  const fixture = await createFixture();
  const calls = [];
  await expect(markManifestLatestRelease({
    cwd: fixture.rootDir,
    run: runner(fixture.version, calls)
  })).resolves.toEqual({ changed: true, tag: `v${fixture.version}` });
  expect(calls.find((call) => call.includes('edit'))).toEqual([
    'gh', 'release', 'edit', `v${fixture.version}`, '-R', 'campfirium/foliole', '--latest=true'
  ]);
});

it('does nothing when GitHub Latest already matches the public manifest', async () => {
  const fixture = await createFixture();
  const calls = [];
  await expect(markManifestLatestRelease({
    cwd: fixture.rootDir,
    run: runner(fixture.version, calls, fixture.version)
  })).resolves.toEqual({ changed: false, tag: `v${fixture.version}` });
  expect(calls.some((call) => call.includes('edit'))).toBe(false);
});
