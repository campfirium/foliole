// @vitest-environment node

import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { readFile, recordPreparedImportFailure, runPreparedImport } = vi.hoisted(() => ({
  readFile: vi.fn(),
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn()
}));

const { logMainProcessOperationFailure } = vi.hoisted(() => ({
  logMainProcessOperationFailure: vi.fn()
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() }
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile },
  readFile
}));

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure,
  runPreparedImport
}));

vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({
  logMainProcessOperationFailure
}));

vi.mock('../import/managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { authorizeSelectedImportFilePath, resetImportPathAuthorizationForTests } from './importPathAuthorization.js';
import { runTextFileImport } from './importTextFile.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetImportPathAuthorizationForTests();
  readFile.mockResolvedValue('# Secret body');
  runPreparedImport.mockImplementation(() => {
    throw new Error('Import failed');
  });
  recordPreparedImportFailure.mockReturnValue({
    contentFingerprint: null,
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: 'Import failed',
    importId: 'import-failed',
    importedAt: '2026-06-06T10:00:00.000Z',
    nodeId: null,
    provider: 'desktop_text_file',
    resultStatus: 'failed',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/private/book.md',
    sourceName: 'book.md'
  });
});

afterEach(() => {
  resetImportPathAuthorizationForTests();
});

it('records a safe operation failure diagnostic when file import is caught as a failed result', async () => {
  await authorizeSelectedImportFilePath('/tmp/private/book.md');

  await expect(runTextFileImport(undefined, { file_path: '/tmp/private/book.md' })).resolves.toMatchObject({
    failure_reason: 'Import failed',
    import_id: 'import-failed',
    result_status: 'failed',
    source_kind: 'markdown'
  });

  expect(logMainProcessOperationFailure).toHaveBeenCalledWith(
    'import_file',
    { source_kind: 'markdown' },
    expect.any(Error),
    'Import failed'
  );
  const payloadText = JSON.stringify(logMainProcessOperationFailure.mock.calls);
  expect(payloadText).not.toContain('/tmp/private/book.md');
  expect(payloadText).not.toContain(path.basename('/tmp/private/book.md'));
  expect(payloadText).not.toContain('# Secret body');
});
