// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPackage } from '@electron/asar';
import { describe, expect, it } from 'vitest';

import { validatePackagedDesktopIdentity } from './desktop-update-packaged-identity.mjs';

async function createAsar(channel) {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-packaged-identity-'));
  const source = path.join(root, 'source');
  const asarPath = path.join(root, 'app.asar');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(source));
  await writeFile(path.join(source, 'package.json'), JSON.stringify({
    folioleBuildChannel: channel,
    version: '0.8.0'
  }));
  await createPackage(source, asarPath);
  return asarPath;
}

describe('packaged desktop update identity', () => {
  it('accepts the packaged GitHub distribution identity', async () => {
    const asarPath = await createAsar('github');
    expect(validatePackagedDesktopIdentity({ asarPath, version: '0.8.0' }))
      .toEqual({ channel: 'github', version: '0.8.0' });
  });

  it('rejects a MAS package even when it shares the Electron runtime', async () => {
    const asarPath = await createAsar('mas');
    expect(() => validatePackagedDesktopIdentity({ asarPath, version: '0.8.0' }))
      .toThrow('not a GitHub updater distribution');
  });
});
