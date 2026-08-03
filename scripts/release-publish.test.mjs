// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { publishRelease } from './release-publish.mjs';
import { createFixture } from './release-doctor.test-support.mjs';

const SHA = 'a'.repeat(40);

function runner(version, bridgeVersion, calls) {
  const tag = `v${version}`;
  return (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git' && args[0] === 'branch') return 'release\n';
    if (command === 'git' && args[0] === 'rev-parse') return `${SHA}\n`;
    if (args.includes('--draft=false')) return '';
    if (args[2] === tag && args.includes('assets,body,isDraft,tagName,targetCommitish')) {
      return JSON.stringify({
        assets: [{ name: `Foliole-Windows-x64-${version}.exe` }],
        body: '> Platforms: Windows\n\n### Fixed\n\n- A fix.',
        isDraft: true, tagName: tag, targetCommitish: SHA
      });
    }
    if (args[2] === tag) return JSON.stringify({ isDraft: false, tagName: tag });
    return JSON.stringify({ tagName: `v${bridgeVersion}` });
  };
}

describe('release public transition', () => {
  it('publishes a scoped Draft without moving repository latest', async () => {
    const fixture = await createFixture({
      manifest: {
        desktopUpdater: { compatibilityBridgeVersion: '0.8.0' }, latest: '0.8.0',
        releases: [{ version: '0.8.0', platforms: ['windows'] }]
      }
    });
    const calls = [];
    await expect(publishRelease({
      cwd: fixture.rootDir, run: runner(fixture.version, '0.8.0', calls)
    })).resolves.toEqual({ expectedLatest: 'v0.8.0', tag: `v${fixture.version}` });
    expect(calls.find((call) => call.includes('edit'))).toContain('--latest=false');
  });

  it('marks the first complete bridge as repository latest', async () => {
    const fixture = await createFixture({
      manifest: { latest: '0.8.0', releases: [] },
      releaseIntent: {
        schemaVersion: 1, version: '0.9.0', publicationMode: 'bridge',
        selectedPlatforms: ['windows'], scopeBasis: { windows: 'Complete bridge.' }
      }
    });
    const calls = [];
    await expect(publishRelease({
      cwd: fixture.rootDir, run: runner(fixture.version, fixture.version, calls)
    })).resolves.toEqual({ expectedLatest: 'v0.9.0', tag: 'v0.9.0' });
    expect(calls.find((call) => call.includes('edit'))).toContain('--latest=true');
  });

  it('refuses to publish when the reviewed body declares another platform scope', async () => {
    const fixture = await createFixture();
    const calls = [];
    const run = runner(fixture.version, '0.8.0', calls);
    const mismatched = (command, args, options) => {
      const output = run(command, args, options);
      if (command === 'gh' && args.includes('assets,body,isDraft,tagName,targetCommitish')) {
        return JSON.stringify({ ...JSON.parse(output), body: '> Platforms: macOS\n\n### Fixed\n\n- A fix.' });
      }
      return output;
    };
    await expect(publishRelease({ cwd: fixture.rootDir, run: mismatched }))
      .rejects.toThrow('release body must begin with');
    expect(calls.some((call) => call.includes('--draft=false'))).toBe(false);
  });
});
