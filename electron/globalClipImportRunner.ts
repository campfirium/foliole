import type { NativeTextImportResult } from '../lib/platform/nativeContract.js';

import { waitForDatabaseReady } from './database/databaseReadiness.js';
import type { GlobalCapturePanelResult } from './globalCapturePanel.js';
import type { ClipboardRestoreContext } from './globalClipClipboardEvidence.js';
import { restoreClipboardIfUnchanged } from './globalClipClipboardEvidence.js';
import type { GlobalClipDesktopToast } from './globalClipDesktopToastState.js';
import type { GlobalClipIssueStatus } from './globalClipIssueDialog.js';
import { runClipboardImport } from './ipc/importClipboard.js';
import { runTextCaptureToInbox } from './ipc/importTextCapture.js';

interface ClipboardRestoreArgs {
  clipboardRef: Parameters<typeof restoreClipboardIfUnchanged>[0]['clipboardRef'];
  context: ClipboardRestoreContext;
}

async function reportGlobalClipIssue(args: {
  presentIssue: (status: GlobalClipIssueStatus) => Promise<boolean>;
  status: GlobalClipIssueStatus;
  toast: GlobalClipDesktopToast;
}) {
  args.toast.close();
  await args.presentIssue(args.status);
  return null;
}

export async function importWithGlobalClipToast(args: {
  clipboardRestore?: ClipboardRestoreArgs;
  log: (event: string, payload?: Record<string, unknown>) => void;
  run: () => Promise<NativeTextImportResult | null> | NativeTextImportResult | null;
  presentIssue: (status: GlobalClipIssueStatus) => Promise<boolean>;
  toast: GlobalClipDesktopToast;
  waitForReady: typeof waitForDatabaseReady;
}) {
  try {
    try {
      await args.waitForReady();
    } catch (error) {
      args.log('global_clip_database_not_ready', { error });
      return await reportGlobalClipIssue({ ...args, status: 'importFailed' });
    }
    let result: NativeTextImportResult | null = null;
    try {
      result = await args.run();
    } catch (error) {
      args.log('global_clip_import_failed', { error });
      return await reportGlobalClipIssue({ ...args, status: 'importFailed' });
    }
    if (!result?.import_id) {
      args.log('global_clip_import_empty');
      return await reportGlobalClipIssue({ ...args, status: 'empty' });
    }
    args.toast.update('success', result.node_id, result.source_name);
    return result;
  } finally {
    if (args.clipboardRestore) {
      await restoreClipboardIfUnchanged({ ...args.clipboardRestore, log: args.log });
    }
  }
}

export async function handleGlobalCapturePanelResult(args: {
  clipboardRestore?: ClipboardRestoreArgs;
  log: (event: string, payload?: Record<string, unknown>) => void;
  panelResult: GlobalCapturePanelResult;
  runImport: typeof runClipboardImport;
  presentIssue: (status: GlobalClipIssueStatus) => Promise<boolean>;
  showDesktopToast: (status: 'pending') => GlobalClipDesktopToast;
  waitForReady: typeof waitForDatabaseReady;
}) {
  if (args.panelResult.type === 'cancelled') {
    if (args.clipboardRestore) {
      await restoreClipboardIfUnchanged({ ...args.clipboardRestore, log: args.log });
    }
    args.log('global_clip_capture_cancelled');
    return null;
  }
  const toast = args.showDesktopToast('pending');
  if (args.panelResult.type === 'clipboard') {
    return importWithGlobalClipToast({ ...args, run: args.runImport, toast });
  }
  const text = args.panelResult.text;
  return importWithGlobalClipToast({
    ...args,
    run: () => runTextCaptureToInbox(text),
    toast
  });
}
