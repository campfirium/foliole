// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'deb',
      managedAssets: [
        'Foliole-Linux-Experimental-amd64-{version}.deb', 'SHA256SUMS-linux.txt'
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
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, deb), 'deb');
  const sha256 = createHash('sha256').update('deb').digest('hex');
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${sha256} *${deb}\n`);
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

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-release-assembly-'));
  const inputRoot = path.join(root, 'input');
  await writePlatform(inputRoot, 'macos');
  await writePlatform(inputRoot, 'windows');
  await writeLinux(inputRoot);
  return { inputRoot, outputRoot: path.join(root, 'output') };
}

describe('release assembly assets', () => {
  it.each([
    [['macos', 'windows', 'linux'], 12],
    [['windows'], 4],
    [['macos'], 6],
    [['linux'], 2]
  ])('stages exactly the %s intent while validating every active producer', async (scope, count) => {
    const paths = await fixture();
    await expect(assembleReleaseAssets({ ...paths, identity: identity(scope) }))
      .resolves.toHaveLength(count);
  });

  it('blocks a scoped Draft when an unselected active producer is incomplete', async () => {
    const paths = await fixture();
    await writeFile(path.join(paths.inputRoot, 'macos', 'latest-mac.yml'), 'version: 0.8.0\n');
    await expect(assembleReleaseAssets({ ...paths, identity: identity(['windows']) }))
      .rejects.toThrow('version mismatch');
  });

  it('blocks every Draft when the Linux DEB checksum does not match', async () => {
    const paths = await fixture();
    await writeFile(path.join(paths.inputRoot, 'linux', 'SHA256SUMS.txt'), `${'0'.repeat(64)} *Foliole-Linux-Experimental-amd64-${VERSION}.deb\n`);
    await expect(assembleReleaseAssets({ ...paths, identity: identity(['windows']) }))
      .rejects.toThrow('Linux DEB checksum mismatch');
  });
});
