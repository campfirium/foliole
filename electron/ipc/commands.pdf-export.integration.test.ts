// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { exportNodePdf } from '../attachments/attachmentPdfExport.js';
import { SqliteConnectionCoordinator } from '../database/sqliteConnectionCoordinator.js';

import { handleInvokeRequest } from './commands.js';

const { showSaveDialog, handleStorageCommand } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(), handleStorageCommand: vi.fn()
}));
const coordinator = new SqliteConnectionCoordinator();
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showSaveDialog }
}));
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: (execute: () => unknown) => coordinator.runExclusive(execute)
}));
vi.mock('../database/attachments.js', () => ({
  listNodeAttachments: () => {
    coordinator.assertAccess();
    return [{ attachmentId: 'pdf-hash', role: 'reference',
      attachment: { mimeType: 'application/pdf', originalName: 'Paper.pdf' } }];
  }
}));
vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails: () => null }));
vi.mock('../attachments/attachmentLibraryPathSnapshot.js', () => ({
  readAttachmentLibraryPathSnapshot: () => ({ assetsDir: '/library/assets' })
}));
vi.mock('../attachments/resourceResolver.js', () => ({
  resolveAttachmentFile: () => ({ status: 'ready', filePath: '/library/assets/export.pdf', bytes: Buffer.from('PDF') })
}));
vi.mock('../database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn() }));
vi.mock('./assistantCommands.js', () => ({ handleAssistantCommand: vi.fn() }));
vi.mock('./importCommands.js', () => ({ handleImportCommand: vi.fn() }));
vi.mock('./reviewCommands.js', () => ({ handleReviewCommand: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand }));
vi.mock('./updateCommands.js', () => ({ handleDesktopUpdateCommand: vi.fn() }));
vi.mock('./windowCommands.js', () => ({ handleWindowAndUtilityCommand: vi.fn() }));

it('lets another library command complete while the PDF save dialog is open', async () => {
  const sqlite = new Database(':memory:');
  let openDialog!: () => void;
  let cancelDialog!: (result: { canceled: boolean }) => void;
  const opened = new Promise<void>(resolve => { openDialog = resolve; });
  const selection = new Promise<{ canceled: boolean }>(resolve => { cancelDialog = resolve; });
  showSaveDialog.mockImplementation(() => { openDialog(); return selection; });
  handleStorageCommand.mockImplementation((command: string) => {
    if (command === NATIVE_COMMANDS.exportNodePdf) return exportNodePdf('pdf-topic', null);
    coordinator.assertAccess();
    return sqlite.prepare("SELECT 'workspace' AS title").get();
  });

  try {
    const exportRequest = handleInvokeRequest({ command: NATIVE_COMMANDS.exportNodePdf, args: { node_id: 'pdf-topic' } });
    await Promise.race([opened, exportRequest.then(() => { throw new Error('PDF dialog never opened'); })]);
    let competingResult: unknown;
    const competingRequest = handleInvokeRequest({ command: NATIVE_COMMANDS.loadWorkspaceListSnapshot })
      .then(result => { competingResult = result; });
    await new Promise<void>(resolve => setImmediate(resolve));
    const resultWhileOpen = competingResult;
    cancelDialog({ canceled: true });
    await expect(exportRequest).resolves.toEqual({ path: null, status: 'cancelled' });
    await competingRequest;
    expect(resultWhileOpen).toEqual({ title: 'workspace' });
  } finally {
    cancelDialog({ canceled: true });
    sqlite.close();
  }
});
