// @vitest-environment node

import { expect, it, vi } from 'vitest';

const { clipboard, runPreparedImport } = vi.hoisted(() => ({
  clipboard: {
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => ({ isEmpty: vi.fn(() => true) })),
    readText: vi.fn(() => '# Queued clipboard import\n\nBody')
  },
  runPreparedImport: vi.fn(() => ({
    contentFingerprint: 'content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-10-06T00:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'text',
    sourceLocator: 'clipboard://text/2026-10-06T00:00:00.000Z',
    sourceName: 'Queued clipboard import Body'
  }))
}));

vi.mock('../clipboardAccess.js', () => ({ electronClipboardAccess: clipboard }));
vi.mock('./clipboardFilePaths.js', () => ({ collectClipboardFilePaths: vi.fn(async () => []) }));
vi.mock('../database/importPipeline.js', () => ({ runPreparedImport }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));

import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { runClipboardImport } from './importClipboard.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

it('waits for the active database owner before importing clipboard text', async () => {
  const acquired = deferred();
  const release = deferred();
  const activeOwner = runWithDatabaseConnectionOwner(async () => {
    acquired.resolve();
    await release.promise;
  });
  await acquired.promise;

  const importResult = runClipboardImport();
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(runPreparedImport).not.toHaveBeenCalled();

  release.resolve();
  await activeOwner;
  await expect(importResult).resolves.toMatchObject({ import_id: 'import-1' });
  expect(runPreparedImport).toHaveBeenCalledOnce();
});
