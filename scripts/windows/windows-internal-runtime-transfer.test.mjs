// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareWindowsInternalRuntime } from './windows-internal-runtime-transfer.mjs';
import { runWindowsDevControl } from './windows-dev-control.mjs';
import { createWindowsDevRemoteSpecTestFixture } from './windows-dev-remote-spec-test-fixture.mjs';

const cleanups = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

function fixture() {
  const transport = createWindowsDevRemoteSpecTestFixture();
  const repoRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-runtime-transfer-'));
  cleanups.push(() => transport.cleanup(), () => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const electron = path.join(repoRoot, 'node_modules/electron');
  fs.mkdirSync(electron, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'package.json'), '{}');
  fs.writeFileSync(path.join(electron, 'package.json'), JSON.stringify({ version: '44.9.0' }));
  const filename = 'electron-v44.9.0-win32-x64.zip';
  const bytes = 'verified archive fixture';
  fs.writeFileSync(path.join(electron, 'checksums.json'), JSON.stringify({
    [filename]: createHash('sha256').update(bytes).digest('hex')
  }));
  const cached = path.join(repoRoot, 'download.zip');
  fs.writeFileSync(cached, bytes);
  const options = { repoRoot, host: 'zephu@192.168.0.11', env: transport.env, fsApi: transport.fsApi,
    executeGit: vi.fn().mockResolvedValue(JSON.stringify({ packages: {
      'node_modules/electron': { version: '44.9.0' }
    } })), executeScp: vi.fn(), download: vi.fn().mockResolvedValue(cached), transferNpm: vi.fn() };
  return { options, cached, filename, transport };
}

it('downloads on Mac once and transfers only the verified candidate archive over LAN', async () => {
  const { options, filename } = fixture();
  await prepareWindowsInternalRuntime(options);
  await prepareWindowsInternalRuntime(options);
  expect(options.download).toHaveBeenCalledTimes(1);
  expect(options.download).toHaveBeenCalledWith(expect.objectContaining({
    version: '44.9.0', platform: 'win32', arch: 'x64'
  }));
  expect(options.executeScp.mock.calls[0][0].at(-1))
    .toBe(`zephu@192.168.0.11:D:/C/foliole/.tmp/artifacts/${filename}`);
});

it('ships the npm offline bundle of the same candidate so Windows can install without a registry', async () => {
  const { options } = fixture();
  const revision = 'a'.repeat(40);
  await prepareWindowsInternalRuntime({ ...options, revision });
  await prepareWindowsInternalRuntime(options);
  expect(options.transferNpm.mock.calls.map(([call]) => call.revision)).toEqual([revision, 'refs/heads/dev']);
  expect(options.transferNpm).toHaveBeenCalledWith(expect.objectContaining({
    executeScp: options.executeScp, host: 'zephu@192.168.0.11', repoRoot: options.repoRoot
  }));
});

it('rejects corrupt archives and candidate version mismatches before transferring anything', async () => {
  const { options, cached } = fixture();
  fs.appendFileSync(cached, 'corrupt');
  await expect(prepareWindowsInternalRuntime(options)).rejects.toThrow('checksum mismatch');
  options.executeGit.mockResolvedValue(JSON.stringify({ packages: {
    'node_modules/electron': { version: '44.6.0' }
  } }));
  await expect(prepareWindowsInternalRuntime(options)).rejects.toThrow('pinned Windows candidate');
  expect(options.executeScp).not.toHaveBeenCalled();
  expect(options.transferNpm).not.toHaveBeenCalled();
});

it('does not start a remote installation when offline runtime preparation fails', async () => {
  const { options, transport } = fixture();
  const executeSsh = vi.fn();
  await expect(runWindowsDevControl({ argv: ['internal-install'], env: options.env,
    fsApi: transport.fsApi, repoRoot: options.repoRoot, executeGit: options.executeGit,
    executeSsh, executeScp: options.executeScp, stdout: { write: vi.fn() },
    prepareInternalRuntime: vi.fn().mockRejectedValue(new Error('offline archive unavailable'))
  })).rejects.toThrow('offline archive unavailable');
  expect(executeSsh).not.toHaveBeenCalled();
  expect(options.executeGit).not.toHaveBeenCalled();
});
