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
  onlineManifest
} from './release-doctor.test-support.mjs';

const ASSETS = [
  { name: 'Foliole-Windows-x64-0.9.0.exe' },
  { name: 'SHA256SUMS-macos.txt' },
  { name: 'SHA256SUMS-windows.txt' }
];

function githubResponses(version, candidate = {}) {
  const publishedAt = candidate.isDraft === true ? null : '2026-07-31T00:00:00Z';
  return {
    [`gh release view v${version} -R campfirium/foliole --json body,isDraft,publishedAt,tagName,url,assets`]: {
      status: 0,
      stdout: JSON.stringify({
        assets: ASSETS,
        body: '### Fixed\n- A fix.\n',
        isDraft: false,
        publishedAt,
        tagName: `v${version}`,
        url: `https://github.com/campfirium/foliole/releases/tag/v${version}`,
        ...candidate
      }),
      stderr: ''
    },
    'gh release view -R campfirium/foliole --json tagName,isDraft,publishedAt,url': {
      status: 0,
      stdout: JSON.stringify({ isDraft: false, publishedAt, tagName: `v${version}`, url: 'https://example.test' }),
      stderr: ''
    }
  };
}

describe('release doctor', () => {
  it('keeps pre-publish checks independent from committed release metadata', async () => {
    const { rootDir, version } = await createFixture({ enNotes: {}, manifest: { latest: '0.8.0', releases: [] }, zhNotes: {} });
    await writeFile(join(rootDir, `releases/github/v${version}.md`), '');
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(result.phase).toBe('pre');
    expect(findCheck(result, 'package version').status).toBe('PASS');
    expect(findCheck(result, 'T7 release identity').status).toBe('PASS');
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

  it('requires body, notes, and manifest only after publication', async () => {
    const fixture = await createFixture({ enNotes: {}, manifest: { latest: '0.8.0', releases: [] }, zhNotes: {} });
    await writeFile(join(fixture.rootDir, `releases/github/v${fixture.version}.md`), '');
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner(githubResponses(fixture.version)),
      fetcher: async () => onlineManifest(fixture.version),
      marketingRoot: join(fixture.rootDir, 'missing-marketing'),
      rootDir: fixture.rootDir
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
      fetcher: async () => onlineManifest(version), marketingRoot: join(rootDir, 'missing'), rootDir
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
      fetcher: async () => onlineManifest(version),
      marketingRoot,
      rootDir
    });

    for (const title of [
      'GitHub release body remote', 'GitHub release installer asset',
      'GitHub release checksum asset', 'Pages manifest latest', 'marketing posting file'
    ]) expect(findCheck(result, title).status, title).toBe('PASS');
    expect(hasFailures(result.checks)).toBe(false);
  });

  it('keeps the npm script contract registered', async () => {
    const packageJson = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile('package.json', 'utf8')));
    expect(packageJson.scripts['release:doctor']).toBe('node scripts/release-doctor.mjs');
    expect(packageJson.scripts['release:verify:post']).toBe('node scripts/release-doctor.mjs --phase=post');
  });
});
