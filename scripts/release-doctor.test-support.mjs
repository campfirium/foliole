import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function writeJson(rootDir, relativePath, value) {
  await writeFile(join(rootDir, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

export async function createFixture(overrides = {}) {
  const rootDir = join(tmpdir(), `foliole-release-doctor-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(rootDir, 'releases/github'), { recursive: true });
  await mkdir(join(rootDir, 'releases/notes'), { recursive: true });
  await mkdir(join(rootDir, '.github/workflows'), { recursive: true });
  const version = overrides.version ?? '0.9.0';
  await writeJson(rootDir, 'package.json', {
    name: 'foliole',
    scripts: {
      'release:doctor': 'node scripts/release-doctor.mjs',
      'release:verify:post': 'node scripts/release-doctor.mjs --phase=post'
    },
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

export function commandRunner(responses = {}) {
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

export function findCheck(result, title) {
  return result.checks.find((check) => check.title === title);
}

export function onlineManifest(version) {
  return {
    latest: version,
    releases: [{
      url: `https://github.com/campfirium/foliole/releases/tag/v${version}`,
      version
    }]
  };
}
