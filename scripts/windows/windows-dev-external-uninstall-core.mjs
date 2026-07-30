import { createHash } from 'node:crypto';
import path from 'node:path';

export const PRESERVED_OLD_ROOT_CHILDREN = ['evidence', 'protection', 'signing'];

export const REMOVED_OLD_ROOT_CHILDREN = [
  '.runtime-update-backup-18240-1785203918866',
  '.runtime-update-backup-21920-1785203570067',
  '.runtime-update-backup-22008-1785204521181',
  '.runtime-update-backup-4388-1785222441378',
  '.runtime-update-backup-9180-1785205954112',
  '.runtime-update-backup-9468-1785208620786',
  'checkout-state.json',
  'config.json',
  'deployment.json',
  'device.json',
  'empty-git-hooks',
  'review-session.json',
  'runtime',
  'runtime-recovery',
  'status.json',
  'windows-android-lab-adb.mjs',
  'windows-android-lab-device.mjs',
  'windows-android-lab-dispatcher.mjs',
  'windows-android-lab-evidence.mjs',
  'windows-android-lab-git-sync.mjs',
  'windows-android-lab-operation.mjs',
  'windows-android-lab-receive.mjs',
  'windows-android-lab-request.mjs',
  'windows-android-lab-review-action.mjs',
  'windows-android-lab-review-audit-state.ts',
  'windows-android-lab-review-audit-types.ts',
  'windows-android-lab-review-audit.ts',
  'windows-android-lab-review-scenario.mjs',
  'windows-android-lab-review-selection.ts',
  'windows-android-lab-review-snapshot.mjs',
  'windows-android-lab-review-transition.ts',
  'windows-android-lab-runtime-manifest.mjs',
  'windows-android-lab-selfcheck.mjs',
  'windows-android-lab-state.mjs',
  'windows-android-lab-worker.mjs',
  'windows-bounded-process.mjs',
  'worker-empty-hooks'
];

const DIRECTORY_TARGETS = new Set([
  ...REMOVED_OLD_ROOT_CHILDREN.filter((name) => name.startsWith('.runtime-update-backup-')),
  'empty-git-hooks', 'runtime', 'runtime-recovery', 'worker-empty-hooks'
]);
const NEW_RECEIVER_MARKER = 'windows-dev-git\\receive.mjs';
const OLD_RECEIVER_MARKER = 'windows-android-lab-receive.mjs';
const SYSTEM_NODE = 'c:\\program files\\nodejs\\node.exe';

function failure(message) {
  return Object.assign(new Error(message), { exitCode: 64, failureStage: 'preflight' });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function parseExternalUninstallArgs(argv) {
  if (argv.length === 0) return { mode: 'dry-run' };
  if (argv.length === 2 && ['--apply', '--verify'].includes(argv[0])) {
    return { manifestPath: argv[1], mode: argv[0].slice(2) };
  }
  throw failure('external uninstall accepts no arguments, --apply <manifest>, or --verify <manifest>');
}

function expectedEntry(name) {
  return { name, type: PRESERVED_OLD_ROOT_CHILDREN.includes(name) || DIRECTORY_TARGETS.has(name)
    ? 'directory' : 'file' };
}

export function validateOldRootInventory(entries, final = false) {
  const expectedNames = final ? PRESERVED_OLD_ROOT_CHILDREN
    : [...PRESERVED_OLD_ROOT_CHILDREN, ...REMOVED_OLD_ROOT_CHILDREN];
  const expected = expectedNames.map(expectedEntry).sort((a, b) => a.name.localeCompare(b.name));
  const actual = entries.map(({ name, type }) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw failure('old AppData root inventory differs from the approved exact target list');
  }
  return actual;
}

export function validateAuthorizedKeys(content) {
  const lines = content.split(/\r?\n/u).filter(Boolean);
  const lowered = lines.map((line) => line.toLowerCase());
  const newIndexes = lowered.map((line, index) => line.includes(NEW_RECEIVER_MARKER)
    && line.includes(SYSTEM_NODE) ? index : -1).filter((index) => index >= 0);
  const oldIndexes = lowered.map((line, index) => line.includes(OLD_RECEIVER_MARKER)
    ? index : -1).filter((index) => index >= 0);
  if (newIndexes.length !== 1) throw failure('exactly one system-Node Git receiver key is required');
  if (oldIndexes.length > 1) throw failure('at most one legacy Git receiver key is allowed');
  if (!lines.some((line) => !/^\s*command=/iu.test(line))) {
    throw failure('ordinary SSH shell key is missing');
  }
  const legacyIndex = oldIndexes[0] ?? null;
  return {
    contentSha256: sha256(content),
    legacyIndex,
    legacyLine: legacyIndex == null ? null : lines[legacyIndex],
    newReceiverLineSha256: sha256(lines[newIndexes[0]]),
    shellLineCount: lines.filter((line) => !/^\s*command=/iu.test(line)).length
  };
}

export function removeLegacyKeyLine(content, identity) {
  if (identity.legacyIndex == null) return content;
  const lines = content.split(/\r?\n/u).filter(Boolean);
  if (lines[identity.legacyIndex] !== identity.legacyLine) {
    throw failure('legacy Git receiver key changed after dry-run');
  }
  lines.splice(identity.legacyIndex, 1);
  return `${lines.join('\r\n')}\r\n`;
}

function normalized(value) {
  return String(value || '').replaceAll('/', '\\').toLowerCase();
}

export function validateHostSnapshot(snapshot, oldRoot, requireTask) {
  if (!snapshot.isAdmin) throw failure('the SSH account is not an administrator');
  if (snapshot.oldProcesses.length !== 0) throw failure('legacy runtime still owns active processes');
  const packages = snapshot.nodePackages.filter((item) => item.displayName === 'Node.js'
    && item.displayVersion === '22.23.2' && item.windowsInstaller === 1
    && /^\{[0-9a-f-]{36}\}$/iu.test(item.productCode));
  if (packages.length !== 1) throw failure('exactly one Node.js 22.23.2 MSI identity is required');
  if (snapshot.nodeSignature.status !== 'Valid') throw failure('system Node Authenticode signature is not valid');
  if (!requireTask) {
    if (snapshot.scheduledTask !== null) throw failure('legacy scheduled task still exists');
    return packages[0];
  }
  const task = snapshot.scheduledTask;
  const expectedNode = path.win32.join(oldRoot, 'runtime', 'node.exe');
  const expectedWorker = path.win32.join(oldRoot, 'windows-android-lab-worker.mjs');
  if (task?.name !== 'FolioleAndroidLab' || task.taskPath !== '\\' || task.actions.length !== 1
    || normalized(task.actions[0].execute) !== normalized(expectedNode)
    || !normalized(task.actions[0].arguments).includes(normalized(expectedWorker))) {
    throw failure('legacy scheduled task identity differs from the approved target');
  }
  return packages[0];
}

export function assertSnapshotEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw failure(`${label} changed after dry-run`);
  }
}
