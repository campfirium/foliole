// @vitest-environment node

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertExactAssetNames,
  linuxAppImageName,
  managedReleaseAssetNames,
  verifyLinuxArtifactDirectory
} from './linux-release-contract.mjs';

describe('Linux release artifact contract', () => {
  it('verifies the unique Experimental AppImage and checksum', async () => {
    const directory = path.join(tmpdir(), `foliole-linux-contract-${Date.now()}`);
    await mkdir(directory, { recursive: true });
    const name = linuxAppImageName('0.8.0');
    const content = Buffer.from('appimage');
    const checksum = createHash('sha256').update(content).digest('hex');
    await writeFile(path.join(directory, name), content);
    await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${checksum} *${name}\n`);

    await expect(verifyLinuxArtifactDirectory(directory, '0.8.0')).resolves.toEqual({
      appImage: name, checksum
    });
  });

  it('rejects updater metadata and any non-managed release asset', () => {
    const expected = managedReleaseAssetNames('0.8.0');
    expect(expected).toContain('Foliole-Linux-Experimental-x64-0.8.0.AppImage');
    expect(expected).not.toContain('latest-linux.yml');
    expect(() => assertExactAssetNames([...expected, 'latest-linux.yml'], expected, 'Release'))
      .toThrow('asset set mismatch');
  });
});
