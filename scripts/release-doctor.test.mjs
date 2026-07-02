// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectReleaseDoctorChecks,
  formatReleaseDoctorReport,
  hasFailures
} from './release-doctor.mjs';

async function writeJson(rootDir, relativePath, value) {
  await writeFile(join(rootDir, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture(overrides = {}) {
  const rootDir = join(tmpdir(), `foliole-release-doctor-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(rootDir, 'releases/github'), { recursive: true });
  await mkdir(join(rootDir, 'releases/notes'), { recursive: true });
  await mkdir(join(rootDir, '.github/workflows'), { recursive: true });
  const version = overrides.version ?? '0.9.0';
  await writeJson(rootDir, 'package.json', {
    name: 'foliole',
    scripts: { 'release:doctor': 'node scripts/release-doctor.mjs' },
    version
  });
  await writeJson(rootDir, 'releases/update-manifest.json', overrides.manifest ?? {
    latest: version,
    releases: [{
      platforms: ['windows'],
      url: `https://github.com/campfirium/foliole/releases/tag/v${version}`,
      version
    }]
  });
  await writeJson(rootDir, 'releases/notes/en.json', overrides.enNotes ?? { [version]: { notes: ['Fixed', 'A fix.'] } });
  await writeJson(rootDir, 'releases/notes/zh-Hans.json', overrides.zhNotes ?? { [version]: { notes: ['修复', '一个修复。'] } });
  await writeFile(join(rootDir, `releases/github/v${version}.md`), '### Fixed\n- A fix.\n');
  await writeFile(join(rootDir, '.github/workflows/release-windows.yml'), [
    'release_ref:',
    'ref: ${{ inputs.release_ref }}',
    '$expectedTag = "v$($package.version)"',
    '$expectedBranch = "release/$($package.version)"'
  ].join('\n'));
  return { rootDir, version };
}

function commandRunner(responses = {}) {
  return (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    if (responses[key]) {
      return responses[key];
    }
    if (command === 'git') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'gh') {
      return { error: Object.assign(new Error('not found'), { code: 'ENOENT' }), status: null, stdout: '', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
}

function findCheck(result, title) {
  return result.checks.find((check) => check.title === title);
}

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
        stdout: JSON.stringify({ isDraft: true, tagName: `v${version}`, url: 'https://example.test' }),
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
      rootDir
    });

    expect(findCheck(pre, 'GitHub release draft').status).toBe('PASS');
    expect(findCheck(pre, 'GitHub latest release').status).toBe('WARN');
    expect(findCheck(post, 'GitHub release draft').status).toBe('FAIL');
    expect(findCheck(post, 'GitHub latest release').status).toBe('FAIL');
  });

  it('keeps the npm script contract registered', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile('package.json', 'utf8'));
    const packageJson = JSON.parse(source);

    expect(packageJson.scripts['release:doctor']).toBe('node scripts/release-doctor.mjs');
  });
});
