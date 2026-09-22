// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { SqliteConnectionCoordinator } from '../database/sqliteConnectionCoordinator.js';

const mocks = vi.hoisted(() => ({
  loadPrepared: vi.fn(), runPrepared: vi.fn(), recordFailure: vi.fn(), patch: vi.fn(), owner: vi.fn()
}));
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));
vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner: mocks.owner }));
vi.mock('../database/externalSearchMirrorRead.js', () => ({ loadExternalSearchMirrorImportSource: vi.fn() }));
vi.mock('../database/importPipeline.js', () => ({ runPreparedImport: mocks.runPrepared, recordPreparedImportFailure: mocks.recordFailure }));
vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({ logMainProcessOperationFailure: vi.fn() }));
vi.mock('../import/importNodeMutationPatch.js', () => ({ withTextImportNodeMutationPatch: mocks.patch, buildImportNodeMutationPatch: vi.fn() }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
vi.mock('./epubImport.js', () => ({ loadEpubPreview: vi.fn(), runEpubImport: vi.fn() }));
vi.mock('./importPathAuthorization.js', () => ({
  assertAuthorizedImportFilePath: vi.fn(async (value) => value), authorizeSelectedImportFilePaths: vi.fn()
}));
vi.mock('./importSourcePipeline.js', () => ({
  buildPreparedImportRecord: vi.fn(() => ({})), importTargetParentNodeProps: vi.fn(() => ({})),
  loadPreparedImportRecord: mocks.loadPrepared, resolveImportHighlightPolicy: vi.fn(),
  resolveImportNodeTitleStrategy: vi.fn(), resolveSingleFileImportSource: vi.fn(() => ({ kind: 'pdf' }))
}));

import { runTextFileImport } from './importTextFile.js';

let coordinator: SqliteConnectionCoordinator;
const imported = { importId: 'import-1', nodeId: 'pdf-1', resultStatus: 'imported', sourceKind: 'pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  coordinator = new SqliteConnectionCoordinator();
  mocks.owner.mockImplementation((execute) => coordinator.runExclusive(execute));
  mocks.loadPrepared.mockResolvedValue({});
  mocks.runPrepared.mockImplementation(() => { coordinator.assertAccess(); return imported; });
  mocks.recordFailure.mockImplementation(() => {
    coordinator.assertAccess();
    return { ...imported, nodeId: null, resultStatus: 'failed' };
  });
  mocks.patch.mockImplementation((result) => { coordinator.assertAccess(); return result; });
});

it('imports successfully after competing database work releases the connection', async () => {
  let release!: () => void;
  const competing = coordinator.runExclusive(() => new Promise<void>((resolve) => { release = resolve; }));
  const result = runTextFileImport(undefined, { file_path: '/fixture.pdf' });
  // Immediately attach a rejection observer so the old broken path is a normal assertion failure.
  const settled = result.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.waitFor(() => expect(mocks.loadPrepared).toHaveBeenCalled());
  release();
  await competing;
  await expect(settled).resolves.toMatchObject({ value: { node_id: 'pdf-1', result_status: 'imported' } });
  expect(mocks.recordFailure).not.toHaveBeenCalled();
});

it('records a source preparation failure after competing database work finishes', async () => {
  mocks.loadPrepared.mockRejectedValue(new Error('source_unavailable'));
  let release!: () => void;
  const competing = coordinator.runExclusive(() => new Promise<void>((resolve) => { release = resolve; }));
  const settled = runTextFileImport(undefined, { file_path: '/fixture.pdf' })
    .then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.waitFor(() => expect(mocks.loadPrepared).toHaveBeenCalled());
  release();
  await competing;
  await expect(settled).resolves.toMatchObject({ value: { result_status: 'failed' } });
});

it('allows unrelated database work while source preparation is waiting', async () => {
  let finishRead!: (value: object) => void;
  mocks.loadPrepared.mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
  const result = runTextFileImport(undefined, { file_path: '/fixture.pdf' });
  await vi.waitFor(() => expect(mocks.loadPrepared).toHaveBeenCalled());
  await expect(coordinator.runExclusive(() => 'ordinary-read')).resolves.toBe('ordinary-read');
  finishRead({});
  await expect(result).resolves.toMatchObject({ node_id: 'pdf-1' });
});
