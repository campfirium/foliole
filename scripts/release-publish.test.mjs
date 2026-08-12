// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { publishRelease } from './release-publish.mjs';
import { createFixture } from './release-doctor.test-support.mjs';

const SHA = 'a'.repeat(40);

function runner(version, latestVersion, calls) {
  const tag = `v${version}`;
  return (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git' && args[0] === 'branch') return 'release\n';
    if (command === 'git' && args[0] === 'rev-parse') return `${SHA}\n`;
    if (args.includes('--draft=false')) return '';
    if (args[2] === tag && args.includes('isDraft,tagName,url')) {
      return JSON.stringify({
        isDraft: true, tagName: tag
      });
    }
    if (args[2] === tag) return JSON.stringify({ isDraft: false, tagName: tag });
    return JSON.stringify({ tagName: `v${latestVersion}` });
  };
}

describe('release public transition', () => {
  it('publishes a confirmed Draft as repository latest', async () => {
    const fixture = await createFixture({
      manifest: {
        desktopUpdater: { compatibilityBridgeVersion: '0.8.0' }, latest: '0.8.0',
        releases: [{ version: '0.8.0', platforms: ['windows'] }]
      }
    });
    const calls = [];
    await expect(publishRelease({
      cwd: fixture.rootDir, run: runner(fixture.version, fixture.version, calls)
    })).resolves.toEqual({ expectedLatest: `v${fixture.version}`, tag: `v${fixture.version}` });
    expect(calls.find((call) => call.includes('edit'))).toContain('--latest=true');
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

  it('refuses to publish a non-Draft release', async () => {
    const fixture = await createFixture();
    const calls = [];
    const run = runner(fixture.version, '0.8.0', calls);
    const published = (command, args, options) => {
      const output = run(command, args, options);
      if (command === 'gh' && args.includes('isDraft,tagName,url')) {
        return JSON.stringify({ ...JSON.parse(output), isDraft: false });
      }
      return output;
    };
    await expect(publishRelease({ cwd: fixture.rootDir, run: published }))
      .rejects.toThrow('requires the confirmed unpublished Draft');
    expect(calls.some((call) => call.includes('--draft=false'))).toBe(false);
  });
});
