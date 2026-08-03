// @vitest-environment node

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { assertDebMetadata, linuxDebName, verifyLinuxDebDirectory } from './linux-deb-contract.mjs';

it('maps linux x64 release identity to one Experimental amd64 DEB', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'foliole-deb-contract-'));
  const deb = linuxDebName('1.2.3');
  const content = Buffer.from('deb');
  await writeFile(path.join(directory, deb), content);
  await writeFile(path.join(directory, 'SHA256SUMS.txt'),
    `${createHash('sha256').update(content).digest('hex')} *${deb}\n`);

  await expect(verifyLinuxDebDirectory(directory, '1.2.3')).resolves.toMatchObject({ deb });
  await writeFile(path.join(directory, 'SHA256SUMS-linux.txt'),
    `${createHash('sha256').update(content).digest('hex')} *${deb}\n`);
  await expect(verifyLinuxDebDirectory(directory, '1.2.3', {
    allowOtherFiles: true, checksumFile: 'SHA256SUMS-linux.txt'
  }))
    .resolves.toMatchObject({ deb });
  expect(assertDebMetadata({ Architecture: 'amd64', Package: 'foliole', Version: '1.2.3' }, '1.2.3'))
    .toEqual({ Architecture: 'amd64', Package: 'foliole', Version: '1.2.3' });
  expect(() => assertDebMetadata({ Architecture: 'x64' }, '1.2.3')).toThrow('amd64');
});
