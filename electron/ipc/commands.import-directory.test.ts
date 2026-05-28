// @vitest-environment node

import { expect, it, vi } from 'vitest';

const { runClipboardImport, runDirectoryImport } = vi.hoisted(() => ({
  runClipboardImport: vi.fn().mockResolvedValue({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-clipboard',
    imported_at: '2026-04-26T10:00:00.000Z',
    node_id: 'node-clipboard',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'text',
    source_locator: 'clipboard://text/2026-04-26T10:00:00.000Z',
    source_name: 'Clipboard Text.txt'
  }),
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
vi.mock('./importClipboard.js', () => ({ runClipboardImport }));
vi.mock('./fonts.js', () => ({ listSystemFonts: vi.fn() }));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn() }));
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

it('routes run_clipboard_import through the invoke handler', async () => {
  await expect(handleInvokeRequest({ command: 'run_clipboard_import', args: { highlight_policy: 'adopt', target_parent_node_id: 'node-target' } })).resolves.toEqual({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-clipboard',
    imported_at: '2026-04-26T10:00:00.000Z',
    node_id: 'node-clipboard',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'text',
    source_locator: 'clipboard://text/2026-04-26T10:00:00.000Z',
    source_name: 'Clipboard Text.txt'
  });

  expect(runClipboardImport).toHaveBeenCalledWith({ highlight_policy: 'adopt', target_parent_node_id: 'node-target' });
});
