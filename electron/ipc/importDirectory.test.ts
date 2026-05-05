// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { recordPreparedImportFailure, runPreparedImport } = vi.hoisted(() => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn()
}));

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure,
  runPreparedImport
}));

import { runDirectoryImport } from './importDirectory.js';

const tempRoots: string[] = [];

function createPersistedRecord(
  prepared: {
    contentFingerprint: string;
    degradedReason: string | null;
    importedAt: string;
    provider: 'desktop_text_file';
    sourceFingerprint: string;
    sourceKind: 'html' | 'markdown' | 'text';
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
    root_path: root
  });
  expect(runPreparedImport).toHaveBeenCalledTimes(2);
  expect(runPreparedImport).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      content: 'Use <highlight id="1">important</highlight id="1"> text',
      degradedReason: null,
      sourceKind: 'markdown',
      sourceName: 'a-note.md'
    })
  );
  expect(runPreparedImport).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      content: '[Table degraded]\nName | Value\nAlpha | Beta',
      degradedReason: 'HTML conversion degraded: table',
      sourceKind: 'html',
      sourceName: path.join('b-web', 'embed.html')
    })
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
    root_path: root
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
