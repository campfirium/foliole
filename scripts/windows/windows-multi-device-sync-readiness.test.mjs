// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  inspectWindowsAcceptanceReadiness, provisionWindowsAcceptanceRoot,
  windowsAcceptanceRoot
} from './windows-multi-device-sync-readiness.mjs';

function fixture() {
  const paths = { gitPath: 'C:\\tools\\git.exe', repoRoot: 'C:\\dev\\foliole',
    systemNode: 'C:\\Program Files\\nodejs\\node.exe' };
  const files = new Map([[paths.gitPath, ''], [paths.systemNode, '']]);
  const fsApi = { existsSync: (name) => files.has(name), mkdirSync: vi.fn(),
    readFileSync: (name) => files.get(name), statfsSync: () => ({ bavail: 8, bsize: 1024 ** 3 }),
    writeFileSync: (name, value) => files.set(name, value) };
  return { files, fsApi, paths };
}

it('provisions the fixed root separately and keeps readiness read-only', async () => {
  const { fsApi, paths } = fixture();
  await expect(inspectWindowsAcceptanceReadiness({ fsApi, paths, platform: 'win32' }))
    .rejects.toMatchObject({ missingFact: 'windows_owner_missing' });
  provisionWindowsAcceptanceRoot({ fsApi, paths });
  const execute = vi.fn(async (_command, args) => ({ code: 0, stdout:
    args.includes('branch') ? 'dev\n' : '' }));
  const interactiveProbe = vi.fn(async () => undefined);
  await expect(inspectWindowsAcceptanceReadiness({
    execute, fsApi, interactiveProbe, paths, platform: 'win32'
  })).resolves.toMatchObject({ facts: expect.arrayContaining([
    'windows_repo_ready', 'windows_interactive_action_ready'
  ]) });
  expect(execute).toHaveBeenCalledTimes(2);
  expect(interactiveProbe).toHaveBeenCalledWith(paths.repoRoot);
});

it('blocks before mutation when the interactive action channel cannot start', async () => {
  const { fsApi, paths } = fixture();
  provisionWindowsAcceptanceRoot({ fsApi, paths });
  const execute = vi.fn(async (_command, args) => ({ code: 0, stdout:
    args.includes('branch') ? 'dev\n' : '' }));
  await expect(inspectWindowsAcceptanceReadiness({ execute, fsApi,
    interactiveProbe: async () => { throw new Error('task did not start'); },
    paths, platform: 'win32' })).rejects.toMatchObject({
    lastSuccessfulAction: 'windows_disk_ready',
    missingFact: 'windows_interactive_action_unavailable'
  });
});

it('refuses an unknown Windows owner without replacing its marker', () => {
  const { files, fsApi, paths } = fixture();
  const root = windowsAcceptanceRoot(paths);
  const marker = `${root}\\acceptance-owner.json`;
  files.set(marker, JSON.stringify({ owner: 'another-system' }));
  expect(() => provisionWindowsAcceptanceRoot({ fsApi, paths })).toThrow('another owner');
  expect(JSON.parse(files.get(marker)).owner).toBe('another-system');
});
