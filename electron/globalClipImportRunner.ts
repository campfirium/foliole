import type { NativeTextImportResult } from '../lib/platform/nativeContract.js';

import { waitForDatabaseReady } from './database/databaseReadiness.js';
import type { GlobalCapturePanelResult } from './globalCapturePanel.js';
import type { GlobalClipDesktopToast } from './globalClipDesktopToastState.js';
import { runClipboardImport } from './ipc/importClipboard.js';
import { runTextCaptureToInbox } from './ipc/importTextCapture.js';

export async function importWithGlobalClipToast(args: {
  log: (event: string, payload?: Record<string, unknown>) => void;
  run: () => Promise<NativeTextImportResult | null> | NativeTextImportResult | null;
  toast: GlobalClipDesktopToast;
  waitForReady: typeof waitForDatabaseReady;
}) {
  try {
    await args.waitForReady();
  } catch (error) {
    args.log('global_clip_database_not_ready', { error });
    args.toast.update('importFailed');
    return null;
  }
  let result: NativeTextImportResult | null = null;
  try {
    result = await args.run();
  } catch (error) {
    args.log('global_clip_import_failed', { error });
    args.toast.update('importFailed');
    return null;
  }
  if (!result?.import_id) {
    args.log('global_clip_import_empty');
    args.toast.update('empty');
    return null;
  }
  args.toast.update('success', result.node_id, result.source_name);
  return result;
}

export async function handleGlobalCapturePanelResult(args: {
  log: (event: string, payload?: Record<string, unknown>) => void;
  panelResult: GlobalCapturePanelResult;
  runImport: typeof runClipboardImport;
  showDesktopToast: (status: 'pending') => GlobalClipDesktopToast;
  waitForReady: typeof waitForDatabaseReady;
}) {
  if (args.panelResult.type === 'cancelled') {
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
