// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const openPath = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ shell: { openPath } }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: mockedAppDataDir })
}));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleAssistantStorageCommand } from './assistantStorageCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-storage-command-'));
  mockedAppDataDir = path.join(tempRoot, 'user-data');
  openPath.mockReset();
  openPath.mockResolvedValue('');
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('inventories only the fixed Aide device data root', async () => {
  const aideRoot = path.join(mockedAppDataDir, 'Aide');
  await fs.mkdir(aideRoot, { recursive: true });
  await fs.writeFile(path.join(aideRoot, 'history.db'), 'local-history');

  await expect(handleAssistantStorageCommand(NATIVE_COMMANDS.assistantGetStorageInfo)).resolves.toEqual({
    bytes: 'local-history'.length,
    complete: true,
    issueCount: 0,
    path: aideRoot
  });
});

it('opens the fixed Aide root and reports shell failures', async () => {
  const aideRoot = path.join(mockedAppDataDir, 'Aide');
  await expect(handleAssistantStorageCommand(NATIVE_COMMANDS.assistantOpenStorageLocation)).resolves.toBeNull();
  expect(openPath).toHaveBeenCalledWith(aideRoot);

  openPath.mockResolvedValueOnce('not available');
  await expect(handleAssistantStorageCommand(NATIVE_COMMANDS.assistantOpenStorageLocation))
    .rejects.toThrow('assistant_storage_location_open_failed');
});
