// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { notifyManagedInboxUpdated, runPreparedImport } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn(),
  runPreparedImport: vi.fn(() => ({
    contentFingerprint: 'content-fp',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-06-08T00:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fp',
    sourceKind: 'text',
    sourceLocator: 'capture://text/2026-06-08T00:00:00.000Z',
    sourceName: 'quick thought'
  }))
}));

vi.mock('../database/importPipeline.js', () => ({ runPreparedImport }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));

import { runTextCaptureToInbox } from './importTextCapture.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('imports typed capture text into Inbox and notifies the managed Inbox', () => {
  const result = runTextCaptureToInbox('  quick thought  ');

  expect(result).toMatchObject({ import_id: 'import-1', node_id: 'node-1' });
  expect(runPreparedImport).toHaveBeenCalledWith(expect.objectContaining({
    content: 'quick thought',
    sourceLocator: expect.stringMatching(/^capture:\/\/text\//),
    sourceName: 'quick thought'
  }));
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('import-1');
});

it('names long typed capture text from a truncated content preview', () => {
  runTextCaptureToInbox('This is a long typed capture that should become a compact topic title with an ellipsis.');

  expect(runPreparedImport).toHaveBeenCalledWith(expect.objectContaining({
    sourceName: 'This is a long typed capture that should become...'
  }));
});

it('ignores empty typed capture text', () => {
  expect(runTextCaptureToInbox('   ')).toBeNull();
  expect(runPreparedImport).not.toHaveBeenCalled();
  expect(notifyManagedInboxUpdated).not.toHaveBeenCalled();
});
