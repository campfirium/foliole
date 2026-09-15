import {
  freezeWorkspaceRuntimeWrites,
  unfreezeWorkspaceRuntimeWrites,
  waitForWorkspaceRuntimeWrites
} from '../shared/platform/runtimeInvoke';
import {
  discardPendingWorkspaceDurableMutations,
  readPendingNodeOrder,
  readPendingReadingProgress,
  readPendingRelearnNodes
} from '../shared/platform/workspacePendingDurableMutations';
import { discardPendingWorkspaceNodeSync, listPendingNodeSyncNodeIds } from '../shared/platform/workspacePendingNodeSync';
import {
  replayPendingWorkspaceDurableMutations,
  replayPendingWorkspaceNodeSync
} from '../shared/platform/workspaceRuntimeRepository';

const RESTORE_HANDOFF_KEY = 'foliole-workspace-restore-handoff-v1';
let restoreSessionActive = false;

type WorkspaceRestoreWindow = Window & {
  __folioleFlushPendingEditorDraftBeforeClose?: () => Promise<boolean>;
  __folioleFlushReadingProgressBeforeClose?: () => Promise<boolean>;
};

function getSessionStorage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function hasPendingWorkspaceWrites() {
  return listPendingNodeSyncNodeIds().length > 0 || Boolean(
    readPendingNodeOrder() || readPendingReadingProgress() || readPendingRelearnNodes().length
  );
}

async function flushRegisteredWorkspaceWrites() {
  const runtimeWindow = window as WorkspaceRestoreWindow;
  const editorFlushed = await runtimeWindow.__folioleFlushPendingEditorDraftBeforeClose?.() ?? true;
  const readingFlushed = await runtimeWindow.__folioleFlushReadingProgressBeforeClose?.() ?? true;
  if (!editorFlushed || !readingFlushed) return false;
  await replayPendingWorkspaceNodeSync();
  await replayPendingWorkspaceDurableMutations();
  return !hasPendingWorkspaceWrites();
}

export async function beginWorkspaceRestoreSession() {
  if (restoreSessionActive) return false;
  restoreSessionActive = true;
  try {
    if (!await flushRegisteredWorkspaceWrites()) throw new Error('workspace flush did not settle');
    if (!freezeWorkspaceRuntimeWrites()) throw new Error('workspace write gate is already frozen');
    await waitForWorkspaceRuntimeWrites();
    if (hasPendingWorkspaceWrites()) throw new Error('workspace writes remain pending');
    return true;
  } catch {
    cancelWorkspaceRestoreSession();
    return false;
  }
}

export function cancelWorkspaceRestoreSession() {
  unfreezeWorkspaceRuntimeWrites();
  restoreSessionActive = false;
}

export function completeWorkspaceRestoreSession(fileName: string, reload = () => window.location.reload()) {
  discardPendingWorkspaceNodeSync();
  discardPendingWorkspaceDurableMutations();
  getSessionStorage()?.setItem(RESTORE_HANDOFF_KEY, JSON.stringify({ fileName }));
  reload();
}

export function prepareWorkspaceRestoreHydrate() {
  if (!isWorkspaceRestoreHydratePending()) return false;
  discardPendingWorkspaceNodeSync();
  discardPendingWorkspaceDurableMutations();
  return true;
}

export function isWorkspaceRestoreHydratePending() {
  return Boolean(getSessionStorage()?.getItem(RESTORE_HANDOFF_KEY));
}

export function consumeWorkspaceRestoreCompletion() {
  const storage = getSessionStorage();
  const raw = storage?.getItem(RESTORE_HANDOFF_KEY);
  if (!raw) return null;
  try {
    const fileName = (JSON.parse(raw) as { fileName?: unknown }).fileName;
    if (typeof fileName !== 'string' || !fileName.trim()) return null;
    storage?.removeItem(RESTORE_HANDOFF_KEY);
    return fileName;
  } catch {
    return null;
  }
}

export function resetWorkspaceRestoreSessionForTests() {
  cancelWorkspaceRestoreSession();
  getSessionStorage()?.removeItem(RESTORE_HANDOFF_KEY);
}
