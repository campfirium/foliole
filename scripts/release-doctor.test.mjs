// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectReleaseDoctorChecks,
  formatReleaseDoctorReport,
  hasFailures
} from './release-doctor.mjs';
import {
  commandRunner,
  createFixture,
  findCheck,
  githubResponses,
  onlineDownloads,
  onlineReleaseFetcher,
  siteHome
} from './release-doctor.test-support.mjs';

describe('release doctor', () => {
  it('keeps pre-publish checks independent from committed release metadata', async () => {
    const { rootDir, version } = await createFixture({
      enNotes: {},
      manifest: {
        desktopUpdater: { compatibilityBridgeVersion: '0.8.0' },
        latest: '0.8.0',
        releases: [{ version: '0.8.0', platforms: ['windows'] }]
      },
      zhNotes: {}
    });
    await writeFile(join(rootDir, `releases/github/v${version}.md`), '');
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(result.phase).toBe('pre');
    expect(findCheck(result, 'package version').status).toBe('PASS');
    expect(findCheck(result, 'T7 release identity').status).toBe('PASS');
    expect(findCheck(result, 'platform release identity').status).toBe('PASS');
    expect(findCheck(result, 'release publication mode').status).toBe('PASS');
    expect(findCheck(result, 'GitHub release body')).toBeUndefined();
    expect(findCheck(result, 'manifest latest')).toBeUndefined();
    expect(hasFailures(result.checks)).toBe(false);
    expect(formatReleaseDoctorReport(result)).toContain(`version=${version} phase=pre`);
  });

  it('rejects a T7 workflow with a manual identity or versioned branch', async () => {
    const { rootDir } = await createFixture({
      releaseWorkflow: ['workflow_dispatch:', 'branches:', '  - release/0.9.0', 'target_sha:', 'target_version:'].join('\n')
    });
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(findCheck(result, 'T7 release identity').status).toBe('FAIL');
    expect(hasFailures(result.checks)).toBe(true);
  });

  it('rejects an intent whose platform scope is outside the registry', async () => {
    const { rootDir } = await createFixture({
      releaseIntent: {
        schemaVersion: 1,
        version: '0.9.0',
        publicationMode: 'scoped',
        selectedPlatforms: ['linux'],
        scopeBasis: { linux: 'A Linux release.' }
      }
    });
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(findCheck(result, 'platform release identity')).toMatchObject({
      status: 'FAIL', detail: expect.stringContaining('unknown platform linux')
    });
  });

  it('rejects a later release that reuses a frozen compatibility bridge', async () => {
    const version = '0.7.6';
    const { rootDir } = await createFixture({
      version,
      releaseIntent: {
        schemaVersion: 1,
        version,
        publicationMode: 'bridge',
        selectedPlatforms: ['windows'],
        scopeBasis: { windows: 'Complete bridge.' }
      },
      manifest: {
        desktopUpdater: { compatibilityBridgeVersion: '0.7.5' },
        latest: '0.7.5',
        releases: [{ version: '0.7.5', platforms: ['windows'] }]
      }
    });
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(findCheck(result, 'release publication mode')).toMatchObject({
      status: 'FAIL', detail: 'compatibility bridge is already frozen at 0.7.5.'
    });
    expect(hasFailures(result.checks)).toBe(true);
  });

  it('accepts the first bridge before T7', async () => {
    const version = '0.9.0';
    const { rootDir } = await createFixture({
      releaseIntent: {
        schemaVersion: 1,
        version,
        publicationMode: 'bridge',
        selectedPlatforms: ['windows'],
        scopeBasis: { windows: 'Complete bridge.' }
      },
      manifest: { latest: '0.8.0', releases: [] }
    });
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(findCheck(result, 'release publication mode')).toMatchObject({
      status: 'PASS', detail: 'bridge publication is valid before T7.'
    });
    expect(hasFailures(result.checks)).toBe(false);
  });

  it('requires body, notes, and manifest only after publication', async () => {
    const fixture = await createFixture({ enNotes: {}, manifest: { latest: '0.8.0', releases: [] }, zhNotes: {} });
    await writeFile(join(fixture.rootDir, `releases/github/v${fixture.version}.md`), '');
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner(githubResponses(fixture.version)),
      fetcher: onlineReleaseFetcher(fixture.version),
      marketingRoot: join(fixture.rootDir, 'missing-marketing'),
      rootDir: fixture.rootDir,
      siteFetcher: async () => siteHome(onlineDownloads(fixture.version))
    });

    expect(findCheck(result, 'GitHub release body').status).toBe('FAIL');
    expect(findCheck(result, 'en release notes').status).toBe('FAIL');
    expect(findCheck(result, 'zh-Hans release notes').status).toBe('FAIL');
    expect(findCheck(result, 'manifest latest').status).toBe('FAIL');
  });

  it('does not treat gh authentication failure as a local pre-publish failure', async () => {
    const { rootDir, version } = await createFixture();
    const key = `gh release view v${version} -R campfirium/foliole --json body,isDraft,publishedAt,tagName,url,assets`;
    const result = await collectReleaseDoctorChecks({
      commandRunner: commandRunner({ [key]: { status: 1, stdout: '', stderr: 'gh: not logged in' } }),
      rootDir
    });

    expect(findCheck(result, 'GitHub release remote').status).toBe('SKIPPED');
    expect(hasFailures(result.checks)).toBe(false);
  });

  it('accepts a Draft before publication and requires publishedAt afterwards', async () => {
    const { rootDir, version } = await createFixture();
    const responses = githubResponses(version, { isDraft: true, publishedAt: null });
    const pre = await collectReleaseDoctorChecks({ commandRunner: commandRunner(responses), rootDir });
    const post = await collectReleaseDoctorChecks({
      argv: ['--phase=post'], commandRunner: commandRunner(responses),
      fetcher: onlineReleaseFetcher(version), marketingRoot: join(rootDir, 'missing'), rootDir,
      siteFetcher: async () => siteHome(onlineDownloads(version))
    });

    expect(findCheck(pre, 'GitHub release state').status).toBe('PASS');
    expect(findCheck(post, 'GitHub release state').status).toBe('FAIL');
  });

  it('checks post-public body, assets, online manifest, and posting file', async () => {
    const { rootDir, version } = await createFixture();
    const marketingRoot = join(rootDir, 'marketing');
    await mkdir(join(marketingRoot, 'change'), { recursive: true });
    await writeFile(join(marketingRoot, 'change', `${version}.md`), '# Post\n');
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner(githubResponses(version)),
      fetcher: onlineReleaseFetcher(version),
      marketingRoot,
      rootDir,
      siteFetcher: async () => siteHome(onlineDownloads(version))
    });

    for (const title of [
      'GitHub release body remote', 'GitHub release scoped assets',
      'site release sync run', 'site production deployment', 'site download manifest',
      'site production downloads', 'Pages manifest latest',
      'Pages manifest release platforms', 'marketing posting file'
    ]) expect(findCheck(result, title).status, title).toBe('PASS');
    expect(hasFailures(result.checks)).toBe(false);
  });

  it('rejects post-public closeout when the site did not sync the current release', async () => {
    const fixture = await createFixture();
    const responses = githubResponses(fixture.version);
    responses['gh run list --repo campfirium/foliole-site --workflow deploy.yml --event repository_dispatch --limit 1 --json databaseId,conclusion,url,createdAt'] = {
      status: 0,
      stdout: JSON.stringify([{ conclusion: 'failure', url: 'https://example.test/failed-site-run' }]),
      stderr: ''
    };
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'], commandRunner: commandRunner(responses),
      fetcher: onlineReleaseFetcher(fixture.version),
      marketingRoot: join(fixture.rootDir, 'missing'), rootDir: fixture.rootDir,
      siteFetcher: async () => siteHome(onlineDownloads(fixture.version))
    });

    expect(findCheck(result, 'site release sync run').status).toBe('FAIL');
    expect(hasFailures(result.checks)).toBe(true);
  });

  it('accepts the first bridge after metadata freezes its version', async () => {
    const version = '0.9.0';
    const fixture = await createFixture({
      releaseIntent: {
        schemaVersion: 1, version, publicationMode: 'bridge', selectedPlatforms: ['windows'],
        scopeBasis: { windows: 'Complete bridge.' }
      }
    });
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner(githubResponses(version)),
      fetcher: onlineReleaseFetcher(version),
      marketingRoot: join(fixture.rootDir, 'missing'),
      rootDir: fixture.rootDir,
      siteFetcher: async () => siteHome(onlineDownloads(version))
    });

    expect(findCheck(result, 'GitHub latest release').status).toBe('PASS');
    expect(findCheck(result, 'manifest release platforms').status).toBe('PASS');
  });

  it('keeps the npm script contract registered', async () => {
    const packageJson = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile('package.json', 'utf8')));
    expect(packageJson.scripts['release:doctor']).toBe('node scripts/release-doctor.mjs');
    expect(packageJson.scripts['release:verify:post']).toBe('node scripts/release-doctor.mjs --phase=post');
  });
});
