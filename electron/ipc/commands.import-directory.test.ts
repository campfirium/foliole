// @vitest-environment node

import { expect, it, vi } from 'vitest';

const { runDirectoryImport } = vi.hoisted(() => ({
  runDirectoryImport: vi.fn().mockResolvedValue({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 1,
    entries: [],
    failed_count: 0,
    imported_count: 1,
    root_path: '/tmp/library',
    source_adapter: 'external_directory'
  })
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn() }
}));
vi.mock('./importDirectory.js', () => ({ runDirectoryImport }));
vi.mock('./importTextFile.js', () => ({
  runTextFileImport: vi.fn(),
  selectImportTextFile: vi.fn()
}));
vi.mock('./fonts.js', () => ({ listSystemFonts: vi.fn() }));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./boot.js', () => ({ bootReport: vi.fn() }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: vi.fn() }));

import { handleInvokeRequest } from './commands.js';

it('routes run_directory_import through the invoke handler', async () => {
  await expect(
    handleInvokeRequest({ command: 'run_directory_import', args: { directory_path: '/tmp/library' } })
  ).resolves.toEqual({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 1,
    entries: [],
    failed_count: 0,
    imported_count: 1,
    root_path: '/tmp/library',
    source_adapter: 'external_directory'
  });

  expect(runDirectoryImport).toHaveBeenCalledWith(null, { directory_path: '/tmp/library' });
});
