import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { electronClipboardAccess, type ClipboardEvidenceAccess } from './clipboardAccess.js';
import { waitForDatabaseReady } from './database/databaseReadiness.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import {
  prepareGlobalCapturePanelWindow,
  raiseGlobalCapturePanelWindow,
  showGlobalCapturePanel,
  type GlobalCapturePanelResult
} from './globalCapturePanel.js';
import {
  createClipboardRestoreContext,
  hasClipboardChanged,
  readClipboardSnapshot,
  readRestorableClipboardSnapshot,
  type ClipboardSnapshot
} from './globalClipClipboardEvidence.js';
import { prepareGlobalClipDesktopToastWindow, showGlobalClipDesktopToast } from './globalClipDesktopToast.js';
import type { GlobalClipDesktopToast, GlobalClipToastStatus } from './globalClipDesktopToastState.js';
import { handleGlobalCapturePanelResult, importWithGlobalClipToast } from './globalClipImportRunner.js';
import {
  presentGlobalClipIssue,
  reportGlobalClipCopyIssue,
  type GlobalClipIssueStatus
} from './globalClipIssueDialog.js';
import { runClipboardImport } from './ipc/importClipboard.js';
import { runMacosGlobalClipCopy } from './macosGlobalClipCopy.js';

const COPY_WAIT_TIMEOUT_MS = 220;
const COPY_POLL_INTERVAL_MS = 25;
const POWERSHELL_COPY_COMMAND = [
  '$code = \'[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);\';',
  'Add-Type -Namespace FolioleNativeInput -Name Keyboard -MemberDefinition $code;',
  '$shift = 0x10; $ctrl = 0x11; $alt = 0x12; $c = 0x43; $up = 0x0002; $zero = [UIntPtr]::Zero;',
  '[FolioleNativeInput.Keyboard]::keybd_event($alt, 0, $up, $zero);',
  '[FolioleNativeInput.Keyboard]::keybd_event($shift, 0, $up, $zero);',
  '[FolioleNativeInput.Keyboard]::keybd_event($ctrl, 0, 0, $zero);',
  '[FolioleNativeInput.Keyboard]::keybd_event($c, 0, 0, $zero);',
  'Start-Sleep -Milliseconds 40;',
  '[FolioleNativeInput.Keyboard]::keybd_event($c, 0, $up, $zero);',
  '[FolioleNativeInput.Keyboard]::keybd_event($ctrl, 0, $up, $zero);'
].join(' ');

const execFileAsync = promisify(execFile);

export function resolveWindowsCopyCommandForTests() {
  return POWERSHELL_COPY_COMMAND;
}

export interface GlobalClipToInboxDeps {
  clipboardRef?: ClipboardEvidenceAccess;
  log?: (event: string, payload?: Record<string, unknown>) => void;
  platform?: NodeJS.Platform;
  runImport?: typeof runClipboardImport;
  runMacosCopy?: typeof runMacosGlobalClipCopy;
  sendCopyShortcut?: () => Promise<boolean>;
  prepareCapturePanel?: () => void;
  raiseCapturePanel?: () => boolean;
  prepareDesktopToast?: () => void;
  showCapturePanel?: () => Promise<GlobalCapturePanelResult>;
  showDesktopToast?: (status: GlobalClipToastStatus) => GlobalClipDesktopToast;
  presentIssue?: (status: GlobalClipIssueStatus) => Promise<boolean>;
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
    const after = await readClipboardSnapshot(clipboardRef);
    if (hasClipboardChanged(before, after)) return true;
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
    ], { timeout: 1000 });
    return true;
  } catch (error) {
    appendMainProcessDiagnosticLog('global_clip_copy_shortcut_failed', { error });
    return false;
  }
}

async function runCopyAttempt(args: {
  before: ClipboardSnapshot;
  clipboardRef: NonNullable<GlobalClipToInboxDeps['clipboardRef']>;
  platform: NodeJS.Platform;
  runMacosCopy: typeof runMacosGlobalClipCopy;
  sendCopyShortcut: NonNullable<GlobalClipToInboxDeps['sendCopyShortcut']>;
  waitForChange: NonNullable<GlobalClipToInboxDeps['waitForClipboardChange']>;
}) {
  if (args.platform === 'darwin') return args.runMacosCopy();
  if (args.platform !== 'win32' || !await args.sendCopyShortcut()) {
    return { copyWritten: false, permission: 'granted' as const };
  }
  return {
    copyWritten: await args.waitForChange(args.before, args.clipboardRef),
    permission: 'granted' as const
  };
}

export async function runGlobalClipToInbox(deps: GlobalClipToInboxDeps = {}) {
  const clipboardRef = deps.clipboardRef ?? electronClipboardAccess;
  const log = deps.log ?? appendMainProcessDiagnosticLog;
  const runImport = deps.runImport ?? runClipboardImport;
  const platform = deps.platform ?? (deps.sendCopyShortcut ? 'win32' : process.platform);
  const sendCopyShortcut = deps.sendCopyShortcut ?? sendWindowsCopyShortcut;
  const showCapturePanel = deps.showCapturePanel ?? showGlobalCapturePanel;
  const waitForChange = deps.waitForClipboardChange ?? waitForClipboardChange;
  const waitForReady = deps.waitForReady ?? waitForDatabaseReady;
  const showDesktopToast = deps.showDesktopToast ?? showGlobalClipDesktopToast;
  const presentIssue = deps.presentIssue ?? presentGlobalClipIssue;
  if (globalCaptureInFlight) {
    (deps.raiseCapturePanel ?? raiseGlobalCapturePanelWindow)();
    log('global_clip_capture_in_flight');
    return null;
  }
  globalCaptureInFlight = true;
  try {
    return await runGlobalClipToInboxOnce({
      clipboardRef,
      log,
      runImport,
      runMacosCopy: deps.runMacosCopy ?? runMacosGlobalClipCopy,
      platform,
      sendCopyShortcut,
      showCapturePanel,
      showDesktopToast,
      presentIssue,
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
  runImport: typeof runClipboardImport;
  runMacosCopy: typeof runMacosGlobalClipCopy;
  platform: NodeJS.Platform;
  sendCopyShortcut: NonNullable<GlobalClipToInboxDeps['sendCopyShortcut']>;
  showCapturePanel: NonNullable<GlobalClipToInboxDeps['showCapturePanel']>;
  showDesktopToast: NonNullable<GlobalClipToInboxDeps['showDesktopToast']>;
  presentIssue: NonNullable<GlobalClipToInboxDeps['presentIssue']>;
  waitForChange: NonNullable<GlobalClipToInboxDeps['waitForClipboardChange']>;
  waitForReady: typeof waitForDatabaseReady;
}) {
  const before = await readRestorableClipboardSnapshot(args.clipboardRef);
  let copyResult;
  try {
    copyResult = await runCopyAttempt({
      before: before.snapshot,
      clipboardRef: args.clipboardRef,
      platform: args.platform,
      runMacosCopy: args.runMacosCopy,
      sendCopyShortcut: args.sendCopyShortcut,
      waitForChange: args.waitForChange
    });
  } catch (error) {
    args.log('global_clip_copy_adapter_failed', { error });
    await args.presentIssue('copyFailed');
    return null;
  }
  if (await reportGlobalClipCopyIssue(copyResult.permission, args.log, args.presentIssue)) return null;
  const after = await readClipboardSnapshot(args.clipboardRef);
  if (copyResult.copyWritten || hasClipboardChanged(before.snapshot, after)) {
    const toast = args.showDesktopToast('pending');
    return importWithGlobalClipToast({
      clipboardRestore: {
        clipboardRef: args.clipboardRef,
        context: createClipboardRestoreContext(before, after)
      },
      log: args.log,
      run: args.runImport,
      presentIssue: args.presentIssue,
      toast,
      waitForReady: args.waitForReady
    });
  }
  args.log('global_clip_opening_capture_panel');
  return handleGlobalCapturePanelResult({
    log: args.log,
    panelResult: await args.showCapturePanel(),
    runImport: args.runImport,
    showDesktopToast: args.showDesktopToast,
    presentIssue: args.presentIssue,
    waitForReady: args.waitForReady
  });
}

export function prepareGlobalClipToInboxWindows(deps: GlobalClipToInboxDeps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') return false;
  (deps.prepareCapturePanel ?? prepareGlobalCapturePanelWindow)();
  (deps.prepareDesktopToast ?? prepareGlobalClipDesktopToastWindow)();
  return true;
}
