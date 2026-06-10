import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  app,
  clipboard,
  globalShortcut,
  type App,
  type Clipboard,
  type GlobalShortcut
} from 'electron';

import { waitForDatabaseReady } from './database/databaseReadiness.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import {
  prepareGlobalCapturePanelWindow,
  showGlobalCapturePanel,
  type GlobalCapturePanelResult
} from './globalCapturePanel.js';
import {
  hasClipboardChanged,
  hasStrictTextSelectionClipboard,
  readClipboardSnapshot,
  type ClipboardSnapshot
} from './globalClipClipboardEvidence.js';
import { prepareGlobalClipDesktopToastWindow, showGlobalClipDesktopToast } from './globalClipDesktopToast.js';
import type { GlobalClipDesktopToast, GlobalClipToastStatus } from './globalClipDesktopToastState.js';
import { handleGlobalCapturePanelResult, importWithGlobalClipToast } from './globalClipImportRunner.js';
import { detectWindowsTextSelection } from './globalClipTextSelection.js';
import { runClipboardImport } from './ipc/importClipboard.js';

const DEFAULT_SHORTCUT = 'Alt+Shift+C';
const COPY_WAIT_TIMEOUT_MS = 220;
const COPY_POLL_INTERVAL_MS = 25;
const TEXT_SELECTION_DETECT_TIMEOUT_MS = 90;
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
  detectTextSelection?: () => Promise<boolean | null>;
  runImport?: typeof runClipboardImport;
  sendCopyShortcut?: () => Promise<boolean>;
  prepareCapturePanel?: () => void;
  prepareDesktopToast?: () => void;
  showCapturePanel?: () => Promise<GlobalCapturePanelResult>;
  showDesktopToast?: (status: GlobalClipToastStatus) => GlobalClipDesktopToast;
  shortcut?: string;
  waitForClipboardChange?: (
    before: ClipboardSnapshot,
    clipboardRef: NonNullable<GlobalClipToInboxDeps['clipboardRef']>
  ) => Promise<boolean>;
  waitForReady?: typeof waitForDatabaseReady;
}

let globalCaptureInFlight = false;

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
    if (hasClipboardChanged(before, after)) return true;
    await delay(COPY_POLL_INTERVAL_MS);
  }
  return false;
}

async function detectTextSelectionQuickly(
  detectTextSelection: NonNullable<GlobalClipToInboxDeps['detectTextSelection']>,
  log: NonNullable<GlobalClipToInboxDeps['log']>
) {
  let timedOut = false;
  const detected = detectTextSelection().catch((error) => {
    log('global_clip_text_selection_detection_failed', { error });
    return null;
  });
  const timeout = delay(TEXT_SELECTION_DETECT_TIMEOUT_MS).then(() => {
    timedOut = true;
    return false;
  });
  const result = await Promise.race([detected, timeout]);
  if (timedOut) log('global_clip_text_selection_detection_timed_out');
  return result;
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
    ], { timeout: 1000 });
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
  const detectTextSelection = deps.detectTextSelection ?? detectWindowsTextSelection;
  const showCapturePanel = deps.showCapturePanel ?? showGlobalCapturePanel;
  const waitForChange = deps.waitForClipboardChange ?? waitForClipboardChange;
  const waitForReady = deps.waitForReady ?? waitForDatabaseReady;
  const showDesktopToast = deps.showDesktopToast ?? showGlobalClipDesktopToast;
  if (globalCaptureInFlight) {
    log('global_clip_capture_in_flight');
    return null;
  }
  globalCaptureInFlight = true;
  try {
    return await runGlobalClipToInboxOnce({
      clipboardRef,
      log,
      detectTextSelection,
      runImport,
      sendCopyShortcut,
      showCapturePanel,
      showDesktopToast,
      waitForChange,
      waitForReady
    });
  } finally {
    globalCaptureInFlight = false;
  }
}

async function runGlobalClipToInboxOnce(args: {
  clipboardRef: NonNullable<GlobalClipToInboxDeps['clipboardRef']>;
  log: NonNullable<GlobalClipToInboxDeps['log']>;
  detectTextSelection: NonNullable<GlobalClipToInboxDeps['detectTextSelection']>;
  runImport: typeof runClipboardImport;
  sendCopyShortcut: NonNullable<GlobalClipToInboxDeps['sendCopyShortcut']>;
  showCapturePanel: NonNullable<GlobalClipToInboxDeps['showCapturePanel']>;
  showDesktopToast: NonNullable<GlobalClipToInboxDeps['showDesktopToast']>;
  waitForChange: NonNullable<GlobalClipToInboxDeps['waitForClipboardChange']>;
  waitForReady: typeof waitForDatabaseReady;
}) {
  const before = readClipboardSnapshot(args.clipboardRef);
  const hasTextSelection = await detectTextSelectionQuickly(args.detectTextSelection, args.log);
  if (hasTextSelection === false) {
    args.log('global_clip_opening_capture_panel');
    return handleGlobalCapturePanelResult({
      log: args.log,
      panelResult: await args.showCapturePanel(),
      runImport: args.runImport,
      showDesktopToast: args.showDesktopToast,
      waitForReady: args.waitForReady
    });
  }
  if (await args.sendCopyShortcut() && await args.waitForChange(before, args.clipboardRef)) {
    const after = readClipboardSnapshot(args.clipboardRef);
    if (hasStrictTextSelectionClipboard(after)) {
      const toast = args.showDesktopToast('pending');
      return importWithGlobalClipToast({ log: args.log, run: args.runImport, toast, waitForReady: args.waitForReady });
    }
  }
  args.log('global_clip_opening_capture_panel');
  return handleGlobalCapturePanelResult({
    log: args.log,
    panelResult: await args.showCapturePanel(),
    runImport: args.runImport,
    showDesktopToast: args.showDesktopToast,
    waitForReady: args.waitForReady
  });
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
  (deps.prepareCapturePanel ?? prepareGlobalCapturePanelWindow)();
  (deps.prepareDesktopToast ?? prepareGlobalClipDesktopToastWindow)();
  log('global_clip_shortcut_registered', { shortcut });
  return true;
}
