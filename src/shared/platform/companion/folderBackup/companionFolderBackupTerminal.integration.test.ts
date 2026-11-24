// @vitest-environment node
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import type { CompanionFolderBackupPort, CompanionFolderBackupState } from '../../../../../lib/platform/companionFolderBackupContract';

import { folderAttachmentWorkFixture } from './companionFolderAttachmentWork.testSupport';
import { backUpCompanionDatabase } from './companionFolderBackup';

const runtime = vi.hoisted(() => ({ access: vi.fn(), inventory: vi.fn(), owner: null as unknown, port: null as unknown }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  accessFramedSyncFile: runtime.access, maintainAttachmentFiles: runtime.inventory
} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ getCompanionFolderBackupPort: () => runtime.port }));

const fixtures: Awaited<ReturnType<typeof folderAttachmentWorkFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.clearAllMocks(); });

const interrupted = 'Backup interrupted. Use Back up now to retry.';

/**
 * A native round model following both plugins' shared contract: a request is open from backupDatabase until
 * finishAttachments or cancelDatabase ends it; a released `working` round becomes pending, a reported failure
 * ends it as failed, and a reload turns a still-running round into the interrupted retry.
 */
async function nativeRound() {
  const f = await folderAttachmentWorkFixture({ access: runtime.access }, createBetterSqliteDbPort);
  fixtures.push(f); await f.run();
  runtime.owner = { read: f.host.write, readBackgroundSnapshot: f.host.write,
    runWriter: f.host.write, folderBackupSource: async () => 'owner' };
  runtime.inventory.mockImplementation(f.inventory);
  const native = { phase: 'saved' as CompanionFolderBackupState['phase'], savedAt: 'commit 0', error: null as string | null,
    open: null as string | null, commits: 0 };
  const state = (): CompanionFolderBackupState => ({ configured: true, directoryId: 'profile', directoryLabel: 'Backup',
    databaseSavedAt: native.savedAt, phase: native.phase, errorMessage: native.error, attachmentFilesPending: null });
  const fail = (message: string) => { native.phase = 'failed'; native.error = message; native.open = null; };
  const backupDatabase = vi.fn(async ({ requestId }: { requestId: string }) => {
    native.open = requestId; native.phase = 'working'; native.error = null;
    await f.sqlite.backup(path.join(f.backup, 'Foliole.sqlite'));
    native.savedAt = `commit ${++native.commits}`;
    return { requestId, cancelled: false, databaseCommitted: true, sourcePages: 1, changedPages: 1, state: state() };
  });
  const finishAttachments = vi.fn(async (input: { requestId: string; pending: number | null; errorMessage: string | null }) => {
    if (input.requestId !== native.open) throw new Error('Attachment backup is not ready to finish.');
    native.open = null; native.error = input.errorMessage;
    native.phase = input.errorMessage ? 'failed' : input.pending === 0 ? 'saved' : 'pending';
    return state();
  });
  const cancelDatabase = vi.fn(async ({ requestId, errorMessage }: { requestId: string; errorMessage?: string }) => {
    if (requestId !== native.open) return;
    native.open = null;
    if (errorMessage) fail(errorMessage);
    else if (native.phase === 'working') native.phase = 'pending';
  });
  runtime.port = { ...f.port, backupDatabase, finishAttachments, cancelDatabase,
    getState: async () => state() } as unknown as CompanionFolderBackupPort;
  const reload = () => {
    if (native.phase === 'working') { native.phase = 'pending'; native.error = interrupted; native.open = null; }
  };
  return { f, native, state, fail, backupDatabase, finishAttachments, reload };
}
type Round = Awaited<ReturnType<typeof nativeRound>>;

interface Exit {
  name: string;
  arrange(round: Round): Promise<void> | void;
  /** Runs the round to its exit; interruption never returns to JS and is observed after a reload. */
  run?(round: Round): Promise<unknown>;
  phase: CompanionFolderBackupState['phase'];
  error: string | null;
  savedAt: string;
}

const refuseConfirm = (round: Round) => round.f.sqlite.exec(`CREATE TRIGGER refuse_confirm BEFORE INSERT ON companion_meta
  WHEN NEW.key='folder_backup_saved_revision' BEGIN SELECT RAISE(ABORT,'confirm write refused'); END`);

const exits: Exit[] = [
  { name: 'success', arrange: async round => { await round.f.receive('copied'); }, phase: 'saved', error: null, savedAt: 'commit 1' },
  { name: 'folder picker cancelled', arrange: round => {
    round.backupDatabase.mockImplementationOnce(async ({ requestId }) => ({ requestId, cancelled: true, databaseCommitted: false,
      sourcePages: 0, changedPages: 0, state: round.state() }));
  }, phase: 'saved', error: null, savedAt: 'commit 0' },
  { name: 'failure before the database commits', arrange: round => {
    round.backupDatabase.mockImplementationOnce(async ({ requestId }) => {
      round.native.open = requestId; round.native.phase = 'working';
      round.fail('Cannot read backup directory.'); throw new Error('Cannot read backup directory.');
    });
  }, phase: 'failed', error: 'Cannot read backup directory.', savedAt: 'commit 0' },
  { name: 'native response for another request', arrange: round => {
    round.backupDatabase.mockImplementationOnce(async ({ requestId }) => {
      round.native.open = requestId; round.native.phase = 'working'; round.native.savedAt = 'commit 1';
      return { requestId: 'stale', cancelled: false, databaseCommitted: true, sourcePages: 1, changedPages: 1, state: round.state() };
    });
  }, phase: 'failed', error: 'folder_backup_response_mismatch', savedAt: 'commit 1' },
  { name: 'local confirmation fails after the commit (008416)', arrange: refuseConfirm,
    phase: 'failed', error: 'confirm write refused', savedAt: 'commit 1' },
  { name: 'local confirmation fails and the native finish is refused', arrange: round => {
    refuseConfirm(round);
    round.finishAttachments.mockImplementationOnce(async () => { throw new Error('Attachment backup is not ready to finish.'); });
  }, phase: 'failed', error: 'confirm write refused', savedAt: 'commit 1' },
  { name: 'an attachment copy fails', arrange: async round => {
    await round.f.receive('refused');
    round.f.port.copyAttachment.mockRejectedValueOnce(new Error('provider refused copy'));
  }, phase: 'failed', error: 'provider refused copy', savedAt: 'commit 1' },
  { name: 'folder permission is lost during attachments', arrange: async round => {
    await round.f.receive('unreachable');
    round.f.port.copyAttachments.mockRejectedValueOnce(new Error('Permission Denial: backup folder'));
  }, phase: 'failed', error: 'Permission Denial: backup folder', savedAt: 'commit 1' },
  { name: 'the native finish fails on its own', arrange: round => {
    round.finishAttachments.mockImplementationOnce(async () => { round.fail('Backup folder changed.'); throw new Error('Backup folder changed.'); });
  }, phase: 'failed', error: 'Backup folder changed.', savedAt: 'commit 1' },
  { name: 'native work is cancelled with the owner', arrange: async round => {
    await round.f.receive('cancelled');
    round.f.port.copyAttachments.mockImplementationOnce(async () => ({ results: [] }));
  }, phase: 'failed', error: 'Backup cancelled.', savedAt: 'commit 1' },
  { name: 'automatic backup is turned off mid-round', arrange: async round => { await round.f.receive('left for later'); },
    run: () => { const stop = new AbortController(); stop.abort();
      return backUpCompanionDatabase(false, { automatic: true, continueWork: () => true, stopped: stop.signal }); },
    phase: 'pending', error: null, savedAt: 'commit 1' },
  { name: 'the process dies after the commit', arrange: async round => {
    await round.f.receive('never finished');
    round.finishAttachments.mockImplementationOnce(() => new Promise(() => undefined));
  }, run: async round => { void backUpCompanionDatabase().catch(() => undefined);
    await vi.waitFor(() => expect(round.finishAttachments).toHaveBeenCalled()); round.reload(); },
  phase: 'pending', error: interrupted, savedAt: 'commit 1' }
];

it.each(exits)('ends every round in a final phase with its real error and savedAt: $name', async exit => {
  const round = await nativeRound();
  await exit.arrange(round);
  await (exit.run?.(round) ?? backUpCompanionDatabase().catch(() => undefined));
  round.reload();
  expect(round.native.open).toBeNull();
  expect(['saved', 'pending', 'failed']).toContain(round.native.phase);
  expect({ phase: round.native.phase, error: round.native.error, savedAt: round.native.savedAt })
    .toEqual({ phase: exit.phase, error: exit.error, savedAt: exit.savedAt });
});
