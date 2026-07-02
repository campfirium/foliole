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

describe('release doctor', () => {
  it('reports a clean local pre-publish candidate while skipping missing gh', async () => {
    const { rootDir, version } = await createFixture();
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(result.phase).toBe('pre');
    expect(findCheck(result, 'package version').status).toBe('PASS');
    expect(findCheck(result, 'GitHub release remote').status).toBe('SKIPPED');
    expect(hasFailures(result.checks)).toBe(false);
    expect(formatReleaseDoctorReport(result)).toContain(`version=${version} phase=pre`);
  });

  it('uses phase to classify manifest publish signals', async () => {
    const fixture = await createFixture({
      manifest: {
        latest: '0.8.0',
        releases: []
      }
    });

    const pre = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir: fixture.rootDir });
    const post = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner(),
      fetcher: async () => onlineManifest(fixture.version),
      marketingRoot: join(fixture.rootDir, 'missing-marketing'),
      rootDir: fixture.rootDir
    });

    expect(findCheck(pre, 'manifest latest').status).toBe('WARN');
    expect(findCheck(pre, 'manifest release entry').status).toBe('WARN');
    expect(findCheck(post, 'manifest latest').status).toBe('FAIL');
    expect(findCheck(post, 'manifest release entry').status).toBe('FAIL');
  });

  it('fails local candidate checks for missing notes and empty release body', async () => {
    const { rootDir, version } = await createFixture({
      enNotes: {},
      zhNotes: {}
    });
    await writeFile(join(rootDir, `releases/github/v${version}.md`), '');
    await writeFile(join(rootDir, `releases/github/v${version}.md.moved`), 'moved');
    const result = await collectReleaseDoctorChecks({ commandRunner: commandRunner(), rootDir });

    expect(findCheck(result, 'GitHub release body').status).toBe('FAIL');
    expect(findCheck(result, 'en release notes').status).toBe('FAIL');
    expect(findCheck(result, 'zh-Hans release notes').status).toBe('FAIL');
    expect(hasFailures(result.checks)).toBe(true);
  });

  it('does not treat gh authentication failure as a local failure', async () => {
    const { rootDir, version } = await createFixture();
    const result = await collectReleaseDoctorChecks({
      commandRunner: commandRunner({
        [`gh release view v${version} -R campfirium/foliole --json body,isDraft,tagName,url,assets`]: {
          status: 1,
          stdout: '',
          stderr: 'gh: not logged in'
        }
      }),
      rootDir
    });

    expect(findCheck(result, 'GitHub release remote').status).toBe('SKIPPED');
    expect(hasFailures(result.checks)).toBe(false);
  });

  it('classifies GitHub release status by explicit phase', async () => {
    const { rootDir, version } = await createFixture();
    const responses = {
      [`gh release view v${version} -R campfirium/foliole --json body,isDraft,tagName,url,assets`]: {
        status: 0,
        stdout: JSON.stringify({ assets: [], body: '### Fixed\n- A fix.\n', isDraft: true, tagName: `v${version}`, url: 'https://example.test' }),
        stderr: ''
      },
      'gh release view -R campfirium/foliole --json tagName,isDraft,url': {
        status: 0,
        stdout: JSON.stringify({ isDraft: false, tagName: 'v0.8.0', url: 'https://example.test' }),
        stderr: ''
      }
    };

    const pre = await collectReleaseDoctorChecks({ commandRunner: commandRunner(responses), rootDir });
    const post = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner(responses),
      fetcher: async () => onlineManifest(version),
      marketingRoot: join(rootDir, 'missing-marketing'),
      rootDir
    });

    expect(findCheck(pre, 'GitHub release draft').status).toBe('PASS');
    expect(findCheck(pre, 'GitHub latest release').status).toBe('WARN');
    expect(findCheck(post, 'GitHub release draft').status).toBe('FAIL');
    expect(findCheck(post, 'GitHub latest release').status).toBe('FAIL');
  });

  it('checks post-publish body, assets, online manifest, and posting file', async () => {
    const { rootDir, version } = await createFixture();
    const marketingRoot = join(rootDir, 'marketing');
    await mkdir(join(marketingRoot, 'change'), { recursive: true });
    await writeFile(join(marketingRoot, 'change', `${version}.md`), '# Post\n');
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner({
        [`gh release view v${version} -R campfirium/foliole --json body,isDraft,tagName,url,assets`]: {
          status: 0,
          stdout: JSON.stringify({
            assets: [{ name: `Foliole-Setup-${version}-win-x64.exe` }, { name: 'SHA256SUMS.txt' }],
            body: '### Fixed\n- A fix.\n',
            isDraft: false,
            tagName: `v${version}`,
            url: `https://github.com/campfirium/foliole/releases/tag/v${version}`
          }),
          stderr: ''
        },
        'gh release view -R campfirium/foliole --json tagName,isDraft,url': {
          status: 0,
          stdout: JSON.stringify({ isDraft: false, tagName: `v${version}`, url: 'https://example.test' }),
          stderr: ''
        }
      }),
      fetcher: async () => onlineManifest(version),
      marketingRoot,
      rootDir
    });

    expect(findCheck(result, 'GitHub release body remote').status).toBe('PASS');
    expect(findCheck(result, 'GitHub release installer asset').status).toBe('PASS');
    expect(findCheck(result, 'GitHub release checksum asset').status).toBe('PASS');
    expect(findCheck(result, 'Pages manifest latest').status).toBe('PASS');
    expect(findCheck(result, 'marketing posting file').status).toBe('PASS');
    expect(hasFailures(result.checks)).toBe(false);
  });

  it('keeps post-publish external failures read-only and explicit', async () => {
    const { rootDir, version } = await createFixture();
    const result = await collectReleaseDoctorChecks({
      argv: ['--phase=post'],
      commandRunner: commandRunner({
        [`gh release view v${version} -R campfirium/foliole --json body,isDraft,tagName,url,assets`]: {
          status: 0,
          stdout: JSON.stringify({ assets: [], body: 'different', isDraft: false, tagName: `v${version}`, url: 'https://example.test' }),
          stderr: ''
        },
        'gh release view -R campfirium/foliole --json tagName,isDraft,url': {
          status: 0,
          stdout: JSON.stringify({ isDraft: false, tagName: `v${version}`, url: 'https://example.test' }),
          stderr: ''
        }
      }),
      fetcher: async () => { throw new Error('offline'); },
      marketingRoot: join(rootDir, 'missing-marketing'),
      rootDir
    });

    expect(findCheck(result, 'GitHub release body remote').status).toBe('FAIL');
    expect(findCheck(result, 'GitHub release installer asset').status).toBe('FAIL');
    expect(findCheck(result, 'Pages manifest').status).toBe('UNKNOWN');
    expect(findCheck(result, 'marketing posting file').status).toBe('SKIPPED');
  });

  it('keeps the npm script contract registered', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile('package.json', 'utf8'));
    const packageJson = JSON.parse(source);

    expect(packageJson.scripts['release:doctor']).toBe('node scripts/release-doctor.mjs');
    expect(packageJson.scripts['release:verify:post']).toBe('node scripts/release-doctor.mjs --phase=post');
  });
});
