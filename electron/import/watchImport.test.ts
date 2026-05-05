// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-watch-import-tests';

const { failingSources, runDirectoryImportBatch } = vi.hoisted(() => ({
  failingSources: new Set<string>(),
  runDirectoryImportBatch: vi.fn(async (options: {
    consumePolicy: 'archive' | 'clear' | 'keep';
    rootPath: string;
    sourceAdapter: 'external_directory' | 'foliole_managed_inbox_folder';
    sources: Array<{
      adapterId: 'html_directory' | 'markdown_directory' | 'obsidian_vault' | 'text_directory';
      filePath: string;
      sourceName: string;
    }>;
  }) => {
    const entries = options.sources.map((source) => {
      const failed = failingSources.has(source.sourceName);
      return {
        adapter: source.adapterId,
        content_fingerprint: `content-${source.sourceName}`,
        degraded_reason: null,
        duplicate_semantic: 'new' as const,
        failure_reason: failed ? 'boom' : null,
        import_id: `import-${source.sourceName}`,
        imported_at: '2026-03-22T12:00:00.000Z',
        node_id: failed ? null : `node-${source.sourceName}`,
        provider: 'desktop_text_file' as const,
        result_status: failed ? ('failed' as const) : ('imported' as const),
        source_fingerprint: `source-${source.sourceName}`,
        source_kind: 'markdown' as const,
        source_locator: source.filePath,
        source_name: source.sourceName
      };
    });
    return {
      archive_root_path: null,
      consume_policy: options.consumePolicy,
      consumed_count: 0,
      discovered_count: options.sources.length,
      entries,
      failed_count: entries.filter((entry) => entry.result_status === 'failed').length,
      imported_count: entries.filter((entry) => entry.result_status !== 'failed').length,
      root_path: options.rootPath,
      source_adapter: options.sourceAdapter
    };
  })
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./directoryImportBatch.js', () => ({ runDirectoryImportBatch }));
vi.mock('../ipc/storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({})
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runWatchImportCycle } from './watchImport.js';

let tempRoot = '';

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watch-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  failingSources.clear();
  runDirectoryImportBatch.mockClear();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists watch cursors per configured adapter and skips unchanged sources after restart', async () => {
  const externalRoot = path.join(tempRoot, 'external-library');
  const managedRoot = path.join(mockedAppDataDir, 'inbox');
  await fs.mkdir(managedRoot, { recursive: true });
  await fs.mkdir(externalRoot, { recursive: true });
  await fs.writeFile(path.join(externalRoot, 'note.md'), '# External', 'utf8');
  await fs.writeFile(path.join(managedRoot, 'clip.md'), '# Managed', 'utf8');

  await expect(
    runWatchImportCycle([
      { adapterConfigId: 'external-library', directoryPath: externalRoot },
      { adapterConfigId: 'managed-inbox', sourceAdapter: 'foliole_managed_inbox_folder' }
    ])
  ).resolves.toEqual({
    adapters: [
      expect.objectContaining({ adapter_config_id: 'external-library', discovered_count: 1, pending_count: 1, skipped_count: 0 }),
      expect.objectContaining({ adapter_config_id: 'managed-inbox', discovered_count: 1, pending_count: 1, skipped_count: 0 })
    ]
  });
  expect(runDirectoryImportBatch).toHaveBeenCalledTimes(2);

  closeDatabaseConnection();
  initializeDatabase();

  await expect(
    runWatchImportCycle([
      { adapterConfigId: 'external-library', directoryPath: externalRoot },
      { adapterConfigId: 'managed-inbox', sourceAdapter: 'foliole_managed_inbox_folder' }
    ])
  ).resolves.toEqual({
    adapters: [
      expect.objectContaining({ adapter_config_id: 'external-library', discovered_count: 1, pending_count: 0, skipped_count: 1 }),
      expect.objectContaining({ adapter_config_id: 'managed-inbox', discovered_count: 1, pending_count: 0, skipped_count: 1 })
    ]
  });
  expect(runDirectoryImportBatch).toHaveBeenCalledTimes(2);
});

it('discovers only changed files on rerun for the same adapter config', async () => {
  const root = path.join(tempRoot, 'library');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'a.md'), '# First', 'utf8');
  await fs.writeFile(path.join(root, 'b.md'), '# Second', 'utf8');

  await runWatchImportCycle([{ adapterConfigId: 'library', directoryPath: root }]);

  await delay(20);
  await fs.writeFile(path.join(root, 'b.md'), '# Second updated', 'utf8');

  await expect(runWatchImportCycle([{ adapterConfigId: 'library', directoryPath: root }])).resolves.toEqual({
    adapters: [expect.objectContaining({ adapter_config_id: 'library', discovered_count: 2, pending_count: 1, skipped_count: 1 })]
  });
  expect(runDirectoryImportBatch).toHaveBeenCalledTimes(2);
  expect(runDirectoryImportBatch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sources: [expect.objectContaining({ sourceName: 'b.md' })]
    })
  );
});

it('keeps failed sources pending so an unchanged rerun retries them', async () => {
  const root = path.join(tempRoot, 'retry-library');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'retry.md'), '# Retry me', 'utf8');
  failingSources.add('retry.md');

  await expect(runWatchImportCycle([{ adapterConfigId: 'retry-library', directoryPath: root }])).resolves.toEqual({
    adapters: [expect.objectContaining({ adapter_config_id: 'retry-library', discovered_count: 1, pending_count: 1, skipped_count: 0, failed_count: 1 })]
  });

  failingSources.clear();

  await expect(runWatchImportCycle([{ adapterConfigId: 'retry-library', directoryPath: root }])).resolves.toEqual({
    adapters: [expect.objectContaining({ adapter_config_id: 'retry-library', discovered_count: 1, pending_count: 1, skipped_count: 0, failed_count: 0 })]
  });
  expect(runDirectoryImportBatch).toHaveBeenCalledTimes(2);
});
