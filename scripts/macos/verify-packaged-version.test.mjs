import { expect, it, vi } from 'vitest';

import { verifyPackagedVersion } from './verify-packaged-version.mjs';

function createRun(appVersion = '0.7.2') {
  return vi.fn(() => ({
    status: 0,
    stdout: appVersion
  }));
}

it('requires the app and bundled CLI metadata to carry the requested package version', async () => {
  const run = createRun();
  await expect(verifyPackagedVersion({
    appPath: '/artifacts/Foliole.app',
    readFile: async () => JSON.stringify({ version: '0.7.2' }),
    run,
    version: '0.7.2'
  })).resolves.toBeUndefined();
  expect(run).toHaveBeenCalledWith('plutil', [
    '-extract', 'CFBundleShortVersionString', 'raw', '/artifacts/Foliole.app/Contents/Info.plist'
  ], { encoding: 'utf8' });
});

it('rejects an app or CLI that only looks like the requested baseline by filename', async () => {
  await expect(verifyPackagedVersion({
    appPath: '/artifacts/Foliole.app', readFile: async () => JSON.stringify({ version: '0.7.2' }),
    run: createRun('0.7.4'), version: '0.7.2'
  })).rejects.toThrow('packaged app version is 0.7.4');
  await expect(verifyPackagedVersion({
    appPath: '/artifacts/Foliole.app', readFile: async () => JSON.stringify({ version: '0.7.4' }),
    run: createRun(), version: '0.7.2'
  })).rejects.toThrow('packaged CLI version is 0.7.4');
});
