// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseUpdaterMetadata,
  validateDesktopUpdateArtifacts
} from './desktop-update-artifact-contract.mjs';

async function fixture(platform, version = '0.8.0') {
  const directory = await mkdtemp(path.join(tmpdir(), 'foliole-update-artifacts-'));
  const base = platform === 'macos' ? `Foliole-macOS-arm64-${version}` : `Foliole-Windows-x64-${version}`;
  const checksumTarget = platform === 'macos' ? `${base}.dmg` : `${base}.exe`;
  const updateTarget = platform === 'macos' ? `${base}.zip` : checksumTarget;
  const metadata = platform === 'macos' ? 'latest-mac.yml' : 'latest.yml';
  await writeFile(path.join(directory, checksumTarget), 'installer');
  await writeFile(path.join(directory, `${checksumTarget}.blockmap`), 'blockmap');
  await writeFile(path.join(directory, updateTarget), 'update');
  await writeFile(path.join(directory, `${updateTarget}.blockmap`), 'blockmap');
  const sha512 = createHash('sha512').update('update').digest('base64');
  await writeFile(path.join(directory, metadata), `version: ${version}\nfiles:\n  - url: ${updateTarget}\n    sha512: ${sha512}\n    size: 6\npath: ${updateTarget}\nsha512: ${sha512}\n`);
  const checksumBytes = checksumTarget === updateTarget ? 'update' : 'installer';
  const sha256 = createHash('sha256').update(checksumBytes).digest('hex');
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${sha256} *${checksumTarget}\n`);
  return { directory, metadata, updateTarget };
}

describe('desktop update artifact contract', () => {
  it('parses the stable electron-builder metadata fields without installed dependencies', () => {
    expect(parseUpdaterMetadata("version: '0.8.0'\nfiles:\n  - url: app.zip\n    sha512: digest\n    size: 42\npath: app.zip\nsha512: digest\n"))
      .toEqual({
        files: [{ sha512: 'digest', size: 42, url: 'app.zip' }],
        path: 'app.zip',
        sha512: 'digest',
        version: '0.8.0'
      });
  });

  it.each(['macos', 'windows'])('validates complete %s metadata and payload bytes', async (platform) => {
    const value = await fixture(platform);
    await expect(validateDesktopUpdateArtifacts({ ...value, platform, version: '0.8.0' }))
      .resolves.toEqual({ metadata: value.metadata, target: value.updateTarget });
  });

  it('fails when metadata names a different release asset', async () => {
    const value = await fixture('windows');
    await writeFile(path.join(value.directory, value.metadata), 'version: 0.8.0\npath: renamed.exe\nfiles: []\n');
    await expect(validateDesktopUpdateArtifacts({ directory: value.directory, platform: 'windows', version: '0.8.0' }))
      .rejects.toThrow('resolve exactly');
  });
});
