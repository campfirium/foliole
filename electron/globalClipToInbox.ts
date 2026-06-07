import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

import {
  app,
  clipboard,
  globalShortcut,
  type App,
  type Clipboard,
  type GlobalShortcut,
  type NativeImage
} from 'electron';

import { waitForDatabaseReady } from './database/databaseReadiness.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { showGlobalClipDesktopToast } from './globalClipDesktopToast.js';
import type { GlobalClipDesktopToast, GlobalClipToastStatus } from './globalClipDesktopToastState.js';
import { isExistingClipboardFallbackEnabled } from './globalClipSettings.js';
import { runClipboardImport } from './ipc/importClipboard.js';

const DEFAULT_SHORTCUT = 'Alt+Shift+C';
const COPY_WAIT_TIMEOUT_MS = 700;
const COPY_POLL_INTERVAL_MS = 50;
const POWERSHELL_COPY_COMMAND = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '[System.Windows.Forms.SendKeys]::SendWait("^c");'
].join(' ');

const execFileAsync = promisify(execFile);

export interface GlobalClipToInboxDeps {
  appRef?: Pick<App, 'on'>;
  clipboardRef?: Pick<Clipboard, 'availableFormats' | 'readBuffer' | 'readHTML' | 'readImage' | 'readText'>;
  globalShortcutRef?: Pick<GlobalShortcut, 'register' | 'unregister'>;
  log?: (event: string, payload?: Record<string, unknown>) => void;
  platform?: NodeJS.Platform;
  runImport?: typeof runClipboardImport;
  sendCopyShortcut?: () => Promise<boolean>;
  shouldImportExistingClipboard?: () => boolean;
  showDesktopToast?: (status: GlobalClipToastStatus) => GlobalClipDesktopToast;
  shortcut?: string;
  waitForClipboardChange?: (
    before: ClipboardSnapshot,
    clipboardRef: NonNullable<GlobalClipToInboxDeps['clipboardRef']>
  ) => Promise<boolean>;
  waitForReady?: typeof waitForDatabaseReady;
}

interface ClipboardSnapshot {
  fingerprint: string;
}

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hashBuffer(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function safeReadBuffer(clipboardRef: GlobalClipToInboxDeps['clipboardRef'], format: string) {
  try {
    return clipboardRef?.readBuffer(format) ?? Buffer.alloc(0);
  } catch {
    return Buffer.alloc(0);
  }
}

function safeReadText(read: () => string) {
  try {
    return read();
  } catch {
    return '';
  }
}

function isImageEmpty(image: NativeImage) {
  try {
    return image.isEmpty();
  } catch {
    return true;
  }
}

function readClipboardSnapshot(clipboardRef: NonNullable<GlobalClipToInboxDeps['clipboardRef']>): ClipboardSnapshot {
  const formats = [...clipboardRef.availableFormats()].sort();
  const formatFingerprints = formats.map((format) => {
    const bytes = safeReadBuffer(clipboardRef, format);
    return `${format}:${bytes.length}:${hashBuffer(bytes)}`;
  });
  const image = clipboardRef.readImage();
  const parts = [
    `formats=${formatFingerprints.join('|')}`,
    `html=${hashText(safeReadText(() => clipboardRef.readHTML()))}`,
    `text=${hashText(safeReadText(() => clipboardRef.readText()))}`,
    `image=${isImageEmpty(image) ? 'empty' : 'present'}`
  ];
  return { fingerprint: hashText(parts.join('\n')) };
}

function hasClipboardChanged(before: ClipboardSnapshot, after: ClipboardSnapshot) {
  return before.fingerprint !== after.fingerprint;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForClipboardChange(
  before: ClipboardSnapshot,
  clipboardRef: NonNullable<GlobalClipToInboxDeps['clipboardRef']>
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= COPY_WAIT_TIMEOUT_MS) {
    const after = readClipboardSnapshot(clipboardRef);
    if (hasClipboardChanged(before, after)) {
      return true;
    }
    await delay(COPY_POLL_INTERVAL_MS);
  }
  return false;
}

async function sendWindowsCopyShortcut() {
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      POWERSHELL_COPY_COMMAND
    ], { timeout: 2000 });
    return true;
  } catch (error) {
    appendMainProcessDiagnosticLog('global_clip_copy_shortcut_failed', { error });
    return false;
  }
}

export async function runGlobalClipToInbox(deps: GlobalClipToInboxDeps = {}) {
  const clipboardRef = deps.clipboardRef ?? clipboard;
  const log = deps.log ?? appendMainProcessDiagnosticLog;
  const runImport = deps.runImport ?? runClipboardImport;
  const sendCopyShortcut = deps.sendCopyShortcut ?? sendWindowsCopyShortcut;
  const shouldImportExistingClipboard = deps.shouldImportExistingClipboard ?? isExistingClipboardFallbackEnabled;
  const waitForChange = deps.waitForClipboardChange ?? waitForClipboardChange;
  const waitForReady = deps.waitForReady ?? waitForDatabaseReady;
  const showDesktopToast = deps.showDesktopToast ?? showGlobalClipDesktopToast;
  const before = readClipboardSnapshot(clipboardRef);
  const toast = showDesktopToast('pending');
  const copySent = await sendCopyShortcut();
  if (!copySent) {
    log('global_clip_copy_not_sent');
    toast.update('copyFailed');
    return null;
  }
  if (!await waitForChange(before, clipboardRef)) {
    if (!shouldImportExistingClipboard()) {
      log('global_clip_clipboard_unchanged');
      toast.update('empty');
      return null;
    }
    log('global_clip_importing_existing_clipboard');
  }
  try {
    await waitForReady();
  } catch (error) {
    log('global_clip_database_not_ready', { error });
    toast.update('importFailed');
    return null;
  }
  let result: Awaited<ReturnType<typeof runClipboardImport>> | null = null;
  try {
    result = await runImport();
  } catch (error) {
    log('global_clip_import_failed', { error });
    toast.update('importFailed');
    return null;
  }
  if (!result?.import_id) {
    log('global_clip_import_empty');
    toast.update('empty');
    return null;
  }
  toast.update('success');
  return result;
}

export function installGlobalClipToInboxShortcut(deps: GlobalClipToInboxDeps = {}) {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') {
    return false;
  }
  const appRef = deps.appRef ?? app;
  const globalShortcutRef = deps.globalShortcutRef ?? globalShortcut;
  const log = deps.log ?? appendMainProcessDiagnosticLog;
  const shortcut = deps.shortcut ?? DEFAULT_SHORTCUT;
  const registered = globalShortcutRef.register(shortcut, () => {
    void runGlobalClipToInbox(deps).catch((error) => log('global_clip_to_inbox_failed', { error }));
  });
  if (!registered) {
    log('global_clip_shortcut_registration_failed', { shortcut });
    return false;
  }
  appRef.on('will-quit', () => {
    globalShortcutRef.unregister(shortcut);
  });
  log('global_clip_shortcut_registered', { shortcut });
  return true;
}
