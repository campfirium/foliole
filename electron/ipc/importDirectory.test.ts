// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { recordPreparedImportFailure, runPreparedImport } = vi.hoisted(() => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn()
}));

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure,
  runPreparedImport
}));

vi.mock('./paths.js', () => ({ resolveAppPaths }));

import { runDirectoryImport } from './importDirectory.js';

const tempRoots: string[] = [];

function createPersistedRecord(
  prepared: {
    contentFingerprint: string;
    degradedReason: string | null;
    importedAt: string;
    provider: 'desktop_text_file';
    sourceFingerprint: string;
    sourceKind: 'epub' | 'html' | 'markdown' | 'text';
    sourceLocator: string;
    sourceName: string;
  },
  overrides?: Partial<{ failureReason: string | null; nodeId: string | null; resultStatus: 'degraded' | 'failed' | 'imported' }>
) {
  return {
    contentFingerprint: prepared.contentFingerprint,
    degradedReason: overrides?.resultStatus === 'failed' ? null : prepared.degradedReason,
    duplicateSemantic: 'new' as const,
    failureReason: overrides?.failureReason ?? null,
    importId: `import-${prepared.sourceName}`,
    importedAt: prepared.importedAt,
    nodeId: overrides?.nodeId ?? `node-${prepared.sourceName}`,
    provider: prepared.provider,
    resultStatus: overrides?.resultStatus ?? (prepared.degradedReason ? 'degraded' : 'imported'),
    sourceFingerprint: prepared.sourceFingerprint,
    sourceKind: prepared.sourceKind,
    sourceLocator: prepared.sourceLocator,
    sourceName: prepared.sourceName
  };
}

async function createTempRoot(prefix: string) {
  const parentDir = path.join(process.cwd(), '.tmp-tests');
  await fs.mkdir(parentDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(parentDir, `${prefix}-`));
  tempRoots.push(root);
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveAppPaths.mockReturnValue({
    app_cache_dir: '/tmp/cache',
    app_config_dir: '/tmp/config',
    app_data_dir: '/tmp/app-data',
    app_log_dir: '/tmp/logs'
  });
  runPreparedImport.mockImplementation((prepared) => createPersistedRecord(prepared));
  recordPreparedImportFailure.mockImplementation((prepared, failureReason: string) =>
    createPersistedRecord(prepared, { failureReason, nodeId: null, resultStatus: 'failed' })
  );
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('imports markdown and HTML directories through the shared normalization and persistence pipeline', async () => {
  const root = await createTempRoot('import-directory-generic');
  await fs.writeFile(path.join(root, 'a-note.md'), 'Use ==important== text', 'utf8');
  await fs.mkdir(path.join(root, 'b-web'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'b-web', 'embed.html'),
    '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table>',
    'utf8'
  );

  const result = await runDirectoryImport(undefined, { directory_path: root, highlight_policy: 'adopt' });

  expect(result).toEqual({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 2,
    entries: [
      expect.objectContaining({
        adapter: 'markdown_directory',
        degraded_reason: null,
        result_status: 'imported',
        source_name: 'a-note.md'
      }),
      expect.objectContaining({
        adapter: 'html_directory',
        degraded_reason: 'HTML conversion degraded: table',
        result_status: 'degraded',
        source_name: path.join('b-web', 'embed.html')
      })
    ],
    failed_count: 0,
    imported_count: 2,
    root_path: root,
    source_adapter: 'external_directory'
  });
  expect(runPreparedImport).toHaveBeenCalledTimes(2);
  expect(runPreparedImport.mock.calls).toEqual(
    expect.arrayContaining([
      [
        expect.objectContaining({
          content: 'Use <highlight id="1">important</highlight id="1"> text',
          degradedReason: null,
          sourceKind: 'markdown',
          sourceName: 'a-note.md'
        })
      ],
      [
        expect.objectContaining({
          content: '[Table degraded]\nName | Value\nAlpha | Beta',
          degradedReason: 'HTML conversion degraded: table',
          sourceKind: 'html',
          sourceName: path.join('b-web', 'embed.html')
        })
      ]
    ])
  );
  expect(recordPreparedImportFailure).not.toHaveBeenCalled();
});

it('classifies vault markdown as obsidian imports and skips the .obsidian control directory', async () => {
  const root = await createTempRoot('import-directory-obsidian');
  await fs.mkdir(path.join(root, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(root, '.obsidian', 'ignored.md'), '# hidden', 'utf8');
  await fs.mkdir(path.join(root, 'Daily'), { recursive: true });
  await fs.writeFile(path.join(root, 'Daily', 'note.md'), '# Imported vault note', 'utf8');

  const result = await runDirectoryImport(undefined, { directory_path: root });

  expect(result).toEqual({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 1,
    entries: [
      expect.objectContaining({
        adapter: 'obsidian_vault',
        result_status: 'imported',
        source_name: path.join('Daily', 'note.md')
      })
    ],
    failed_count: 0,
    imported_count: 1,
    root_path: root,
    source_adapter: 'external_directory'
  });
  expect(runPreparedImport).toHaveBeenCalledTimes(1);
  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '# Imported vault note',
      sourceKind: 'markdown',
      sourceName: path.join('Daily', 'note.md')
    })
  );
});

it('resolves the managed inbox folder from runtime paths and archives only imported sources', async () => {
  const appDataDir = await createTempRoot('managed-inbox-runtime');
  const managedRoot = path.join(appDataDir, 'import', 'managed-inbox');
  const failedPath = path.join(managedRoot, 'failed.md');
  const importedPath = path.join(managedRoot, 'clips', 'note.md');
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
  await fs.mkdir(path.dirname(importedPath), { recursive: true });
  await fs.writeFile(importedPath, '# Imported managed note', 'utf8');
  await fs.writeFile(failedPath, '# Failed managed note', 'utf8');
  runPreparedImport.mockImplementation((prepared) => {
    if (prepared.sourceName === 'failed.md') {
      throw new Error('boom');
    }
    return createPersistedRecord(prepared);
  });

  const result = await runDirectoryImport(undefined, {
    consume_policy: 'archive',
    highlight_policy: 'adopt',
    source_adapter: 'foliole_managed_inbox_folder'
  });

  expect(result).toEqual({
    archive_root_path: expect.any(String),
    consume_policy: 'archive',
    consumed_count: 1,
    discovered_count: 2,
    entries: [
      expect.objectContaining({
        adapter: 'markdown_directory',
        result_status: 'imported',
        source_name: path.join('clips', 'note.md')
      }),
      expect.objectContaining({
        adapter: 'markdown_directory',
        failure_reason: 'boom',
        result_status: 'failed',
        source_name: 'failed.md'
      })
    ],
    failed_count: 1,
    imported_count: 1,
    root_path: managedRoot,
    source_adapter: 'foliole_managed_inbox_folder'
  });
  expect(result?.archive_root_path).toMatch(
    new RegExp(`^${path.join(appDataDir, 'import', 'managed-inbox-archive').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  );
  await expect(fs.stat(importedPath)).rejects.toThrow();
  await expect(fs.readFile(failedPath, 'utf8')).resolves.toBe('# Failed managed note');
  await expect(
    fs.readFile(path.join(result?.archive_root_path ?? '', 'clips', 'note.md'), 'utf8')
  ).resolves.toBe('# Imported managed note');
  expect(recordPreparedImportFailure).toHaveBeenCalledTimes(1);
});
