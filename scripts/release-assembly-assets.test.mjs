// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { assembleReleaseAssets } from './release-assembly-assets.mjs';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';

const VERSION = '0.9.0';
const REGISTRY = {
  schemaVersion: 1,
  platforms: [
    {
      id: 'macos', displayName: 'macOS', status: 'active', architectures: ['arm64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      managedAssets: [
        'Foliole-macOS-arm64-{version}.dmg', 'Foliole-macOS-arm64-{version}.dmg.blockmap',
        'Foliole-macOS-arm64-{version}.zip', 'Foliole-macOS-arm64-{version}.zip.blockmap',
        'latest-mac.yml', 'SHA256SUMS-macos.txt'
      ],
      update: { mode: 'electron-updater', baselineVersion: '0.7.2' }
    },
    {
      id: 'windows', displayName: 'Windows', status: 'active', architectures: ['x64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      managedAssets: [
        'Foliole-Windows-x64-{version}.exe', 'Foliole-Windows-x64-{version}.exe.blockmap',
        'latest.yml', 'SHA256SUMS-windows.txt'
      ],
      update: { mode: 'electron-updater', baselineVersion: '0.7.2' }
    },
    {
      id: 'linux', displayName: 'Linux Experimental', status: 'active', architectures: ['x64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'linux-packages',
      managedAssets: [
        'Foliole-Linux-Experimental-amd64-{version}.deb',
        'Foliole-Linux-Experimental-amd64-{version}.AppImage', 'SHA256SUMS-linux.txt'
      ],
      update: { mode: 'manual', baselineVersion: null }
    }
  ]
};

async function writePlatform(root, platform) {
  const directory = path.join(root, platform);
  await mkdir(directory, { recursive: true });
  const base = platform === 'macos' ? `Foliole-macOS-arm64-${VERSION}` : `Foliole-Windows-x64-${VERSION}`;
  const installer = platform === 'macos' ? `${base}.dmg` : `${base}.exe`;
  const update = platform === 'macos' ? `${base}.zip` : installer;
  const metadata = platform === 'macos' ? 'latest-mac.yml' : 'latest.yml';
  await writeFile(path.join(directory, installer), 'installer');
  await writeFile(path.join(directory, `${installer}.blockmap`), 'blockmap');
  if (update !== installer) {
    await writeFile(path.join(directory, update), 'update');
    await writeFile(path.join(directory, `${update}.blockmap`), 'blockmap');
  }
  const updateBytes = platform === 'macos' ? 'update' : 'installer';
  const sha512 = createHash('sha512').update(updateBytes).digest('base64');
  const size = updateBytes.length;
  await writeFile(path.join(directory, metadata), `version: ${VERSION}\nfiles:\n  - url: ${update}\n    sha512: ${sha512}\n    size: ${size}\npath: ${update}\nsha512: ${sha512}\n`);
  const sha256 = createHash('sha256').update('installer').digest('hex');
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${sha256} *${installer}\n`);
}

async function writeLinux(root) {
  const directory = path.join(root, 'linux');
  const deb = `Foliole-Linux-Experimental-amd64-${VERSION}.deb`;
  const appImage = `Foliole-Linux-Experimental-amd64-${VERSION}.AppImage`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, deb), 'deb');
  await writeFile(path.join(directory, appImage), 'appimage');
  const debChecksum = createHash('sha256').update('deb').digest('hex');
  const appImageChecksum = createHash('sha256').update('appimage').digest('hex');
  await writeFile(path.join(directory, 'SHA256SUMS.txt'),
    `${debChecksum} *${deb}\n${appImageChecksum} *${appImage}\n`);
}

function identity(selectedPlatforms) {
  return resolveReleasePlatformIdentity({
    registry: REGISTRY,
    intent: {
      schemaVersion: 1, version: VERSION, publicationMode: 'scoped', selectedPlatforms,
      scopeBasis: Object.fromEntries(selectedPlatforms.map((id) => [id, `${id} change.`]))
    },
    packageVersion: VERSION,
    sha: 'a'.repeat(40)
  });
}

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(scope = ['macos', 'windows', 'linux']) {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/release-assembly-'));
  roots.push(root);
  const inputRoot = path.join(root, 'input');
  for (const platform of scope) {
    if (platform === 'linux') await writeLinux(inputRoot);
    else await writePlatform(inputRoot, platform);
  }
  return { inputRoot, outputRoot: path.join(root, 'output') };
}

describe('release assembly assets', () => {
  it.each([
    [['macos', 'windows', 'linux']],
    [['windows']],
    [['macos']],
    [['linux']],
    [['macos', 'windows']],
    [['macos', 'linux']],
    [['windows', 'linux']]
  ])('assembles %s without any unselected producer directory', async scope => {
    const paths = await fixture(scope);
    const selected = identity(scope);
    await expect(assembleReleaseAssets({ ...paths, identity: selected }))
      .resolves.toEqual([...selected.managedAssets].sort((left, right) => left.localeCompare(right)));
  });

  it('ignores incomplete unselected producer artifacts', async () => {
    const paths = await fixture();
    await writeFile(path.join(paths.inputRoot, 'macos', 'latest-mac.yml'), 'version: 0.8.0\n');
    await expect(assembleReleaseAssets({ ...paths, identity: identity(['windows']) }))
      .resolves.toEqual(expect.arrayContaining(identity(['windows']).managedAssets));
  });

  it('removes old scope assets when assembling again into the same output directory', async () => {
    const paths = await fixture();
    await assembleReleaseAssets({ ...paths, identity: identity(['macos', 'windows', 'linux']) });
    await rm(path.join(paths.inputRoot, 'macos'), { recursive: true });
    await rm(path.join(paths.inputRoot, 'linux'), { recursive: true });
    const selected = identity(['windows']);
    await expect(assembleReleaseAssets({ ...paths, identity: selected }))
      .resolves.toEqual([...selected.managedAssets].sort((left, right) => left.localeCompare(right)));
  });

  it.each(['macos', 'windows'])('blocks corrupted selected %s installer bytes', async platform => {
    const paths = await fixture([platform]);
    const installer = REGISTRY.platforms.find(({ id }) => id === platform).managedAssets[0]
      .replaceAll('{version}', VERSION);
    await writeFile(path.join(paths.inputRoot, platform, installer), 'corrupted');
    await expect(assembleReleaseAssets({ ...paths, identity: identity([platform]) }))
      .rejects.toThrow(/mismatch/u);
  });

  it('blocks a selected producer with the wrong updater version', async () => {
    const paths = await fixture(['macos']);
    await writeFile(path.join(paths.inputRoot, 'macos', 'latest-mac.yml'), 'version: 0.8.0\n');
    await expect(assembleReleaseAssets({ ...paths, identity: identity(['macos']) }))
      .rejects.toThrow('version mismatch');
  });

  it.each(['macos', 'windows', 'linux'])('blocks missing selected %s artifacts', async platform => {
    const paths = await fixture([]);
    await expect(assembleReleaseAssets({ ...paths, identity: identity([platform]) })).rejects.toThrow();
  });

  it('blocks selected Linux when the DEB checksum does not match', async () => {
    const paths = await fixture();
    await writeFile(path.join(paths.inputRoot, 'linux', 'SHA256SUMS.txt'), `${'0'.repeat(64)} *Foliole-Linux-Experimental-amd64-${VERSION}.deb\n`);
    await expect(assembleReleaseAssets({ ...paths, identity: identity(['linux']) }))
      .rejects.toThrow('Linux package checksum count mismatch');
  });
});
