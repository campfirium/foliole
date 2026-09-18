// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { correctPublishedReleaseBody } from './release-published-body.mjs';
import { createFixture } from './release-doctor.test-support.mjs';

function release(version, body = 'Old body.') {
  return {
    assets: [{ digest: 'sha256:abc', name: `Foliole-Windows-x64-${version}.exe`, size: 42 }],
    body,
    isDraft: false,
    isPrerelease: false,
    name: version,
    publishedAt: '2026-09-17T23:52:08Z',
    tagName: `v${version}`,
    targetCommitish: 'a'.repeat(40),
    url: `https://github.com/campfirium/foliole/releases/tag/v${version}`
  };
}

function runner(version, calls, overrides = {}) {
  let current = release(version, overrides.body);
  return (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('--notes-file')) {
      current = { ...current, body: '### Fixed\n- A fix.\n' };
      return '';
    }
    if (args[2] === `v${version}`) return JSON.stringify({ ...current, ...overrides.release });
    return JSON.stringify({ tagName: overrides.latest ?? `v${version}` });
  };
}

describe('published Release body correction', () => {
  it('updates only the reviewed body and preserves public identity', async () => {
    const fixture = await createFixture();
    const calls = [];
    await expect(correctPublishedReleaseBody({
      cwd: fixture.rootDir, run: runner(fixture.version, calls)
    })).resolves.toMatchObject({ changed: true, tag: `v${fixture.version}` });
    expect(calls.find((call) => call.includes('edit'))).toEqual([
      'gh', 'release', 'edit', `v${fixture.version}`, '-R', 'campfirium/foliole',
      '--notes-file', `${fixture.rootDir}/releases/github/v${fixture.version}.md`
    ]);
  });

  it('refuses a Draft or non-Latest release', async () => {
    const fixture = await createFixture();
    await expect(correctPublishedReleaseBody({
      cwd: fixture.rootDir, run: runner(fixture.version, [], { release: { isDraft: true } })
    })).rejects.toThrow('matching published full Release');
    await expect(correctPublishedReleaseBody({
      cwd: fixture.rootDir, run: runner(fixture.version, [], { latest: 'v0.8.0' })
    })).rejects.toThrow('GitHub Latest');
  });
});
