import { Buffer } from 'node:buffer';
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
  await writeJson(rootDir, '.github/release-platforms.json', overrides.platformRegistry ?? {
    schemaVersion: 1,
    platforms: [{
      id: 'windows', displayName: 'Windows', status: 'active', architectures: ['x64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      downloadAsset: 'Foliole-Windows-x64-{version}.exe',
      managedAssets: ['Foliole-Windows-x64-{version}.exe'],
      update: { mode: 'electron-updater', baselineVersion: '0.7.2' }
    }]
  });
  await writeJson(rootDir, '.github/release-intent.json', overrides.releaseIntent ?? {
    schemaVersion: 1,
    version,
    publicationMode: 'scoped',
    selectedPlatforms: ['windows'],
    scopeBasis: { windows: 'The release contains a Windows fix.' }
  });
  await writeJson(rootDir, 'releases/update-manifest.json', overrides.manifest ?? {
    desktopUpdater: { compatibilityBridgeVersion: version },
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
  await writeFile(
    join(rootDir, '.github/workflows/t7-release.yml'),
    overrides.releaseWorkflow ?? [
      'branches:',
      '  - release',
      'FOLIOLE_RELEASE_REF_NAME: ${{ github.ref_name }}',
      'FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}',
      'FOLIOLE_RELEASE_EXPECTED_INTENT_DIGEST: expected',
      'FOLIOLE_RELEASE_REQUIRE_PUBLICATION_MODE: true',
      'node scripts/release-target-contract.mjs'
    ].join('\n')
  );
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
      platforms: ['windows'],
      url: `https://github.com/campfirium/foliole/releases/tag/v${version}`,
      version
    }]
  };
}

export function onlineDownloads(version) {
  const asset = `Foliole-Windows-x64-${version}.exe`;
  return {
    allReleasesUrl: 'https://github.com/campfirium/foliole/releases',
    productVersion: version,
    schemaVersion: 1,
    platforms: {
      windows: {
        architectures: ['x64'], asset, channel: 'github-release',
        releaseUrl: `https://github.com/campfirium/foliole/releases/tag/v${version}`,
        status: 'available', tag: `v${version}`,
        url: `https://github.com/campfirium/foliole/releases/download/v${version}/${asset}`,
        version
      }
    }
  };
}

export function onlineReleaseFetcher(version, manifest = onlineManifest(version), downloads = onlineDownloads(version)) {
  return async (url) => url.endsWith('/downloads.json') ? downloads : manifest;
}

export function githubResponses(version, candidate = {}, latestVersion = version, siteDownloads = onlineDownloads(version)) {
  const publishedAt = candidate.isDraft === true ? null : '2026-07-31T00:00:00Z';
  return {
    [`gh release view v${version} -R campfirium/foliole --json body,isDraft,publishedAt,tagName,url,assets`]: {
      status: 0,
      stdout: JSON.stringify({
        assets: [{ name: `Foliole-Windows-x64-${version}.exe` }],
        body: '### Fixed\n- A fix.\n',
        isDraft: false, publishedAt, tagName: `v${version}`,
        url: `https://github.com/campfirium/foliole/releases/tag/v${version}`,
        ...candidate
      }),
      stderr: ''
    },
    'gh release view -R campfirium/foliole --json tagName,isDraft,publishedAt,url': {
      status: 0,
      stdout: JSON.stringify({ isDraft: false, publishedAt, tagName: `v${latestVersion}`, url: 'https://example.test' }),
      stderr: ''
    },
    'gh run list --repo campfirium/foliole-site --workflow deploy.yml --event repository_dispatch --limit 1 --json conclusion,url,createdAt': {
      status: 0,
      stdout: JSON.stringify([{ conclusion: 'success', createdAt: publishedAt, url: 'https://example.test/site-run' }]),
      stderr: ''
    },
    'gh api repos/campfirium/foliole-site/contents/content/downloads.json?ref=main --jq .content': {
      status: 0,
      stdout: Buffer.from(JSON.stringify(siteDownloads)).toString('base64'),
      stderr: ''
    }
  };
}
