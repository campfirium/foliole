import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import {
  assertMasElectronRuntime, inspectMasElectronRuntime, prepareMasElectronRuntime
} from './mas-electron-runtime.mjs';

const temporaryDirectories = [];

async function createRuntimeFixture(version = '41.10.1') {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'foliole-internal-runtime-'));
  temporaryDirectories.push(repositoryRoot);
  await mkdir(path.join(repositoryRoot, 'node_modules/electron'), { recursive: true });
  await writeFile(path.join(repositoryRoot, 'node_modules/electron/package.json'), JSON.stringify({ version }));
  return repositoryRoot;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )));
});

it('accepts only a local MAS runtime matching the installed Electron dependency', async () => {
  const repositoryRoot = await createRuntimeFixture();
  const destination = path.join(repositoryRoot, '.tmp/electron-mas-arm64');
  await mkdir(path.join(destination, 'Electron.app'), { recursive: true });
  await writeFile(path.join(destination, '.foliole-electron-runtime.json'), JSON.stringify({
    arch: 'arm64', platform: 'mas', version: '41.10.1'
  }));

  await expect(assertMasElectronRuntime({ repositoryRoot })).resolves.toBe(destination);
  await expect(inspectMasElectronRuntime({ repositoryRoot })).resolves.toMatchObject({ ready: true });
});

it('fails locally on version drift without invoking any downloader', async () => {
  const repositoryRoot = await createRuntimeFixture();
  const destination = path.join(repositoryRoot, '.tmp/electron-mas-arm64');
  await mkdir(path.join(destination, 'Electron.app'), { recursive: true });
  await writeFile(path.join(destination, '.foliole-electron-runtime.json'), JSON.stringify({
    arch: 'arm64', platform: 'mas', version: '41.9.0'
  }));

  await expect(assertMasElectronRuntime({ repositoryRoot })).rejects.toThrow(
    'expected 41.10.1, found 41.9.0'
  );
});

it('downloads only in the explicit preparation command and records the exact contract', async () => {
  const repositoryRoot = await createRuntimeFixture();
  const download = vi.fn(async () => '/downloads/electron-mas.zip');
  const extract = vi.fn(async (_source, destination) => {
    await mkdir(path.join(destination, 'Electron.app'));
  });

  const destination = await prepareMasElectronRuntime({ download, extract, repositoryRoot });

  expect(download).toHaveBeenCalledWith({
    arch: 'arm64', artifactName: 'electron', platform: 'mas', version: '41.10.1'
  });
  expect(extract).toHaveBeenCalledWith('/downloads/electron-mas.zip', destination);
  expect(JSON.parse(await readFile(path.join(destination, '.foliole-electron-runtime.json'), 'utf8')))
    .toEqual({ arch: 'arm64', platform: 'mas', version: '41.10.1' });
});

it('prepares the Internal runtime during dependency installation, not during dispatch', async () => {
  const packageJson = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'));

  expect(packageJson.scripts.prepare).toBe(
    'npm run hooks:install && npm run macos:internal:prepare-runtime'
  );
  expect(packageJson.scripts['macos:internal:dispatch'])
    .toBe('node scripts/macos/launch-internal-update.mjs');
  expect(packageJson.scripts['macos:internal:update'])
    .toBe('node scripts/macos/package-mas.mjs --install');
});
