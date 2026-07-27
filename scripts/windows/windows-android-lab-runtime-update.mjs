import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { WINDOWS_ANDROID_LAB_SOURCE_REF } from './windows-android-lab-state.mjs';

export const WINDOWS_ANDROID_LAB_RUNTIME_FILES = [
  'windows-bounded-process.mjs',
  'windows-android-lab-adb.mjs',
  'windows-android-lab-checkout.mjs',
  'windows-android-lab-dispatcher.mjs',
  'windows-android-lab-device.mjs',
  'windows-android-lab-evidence.mjs',
  'windows-android-lab-operation.mjs',
  'windows-android-lab-request.mjs',
  'windows-android-lab-review-action.mjs',
  'windows-android-lab-review-audit.ts',
  'windows-android-lab-review-scenario.mjs',
  'windows-android-lab-review-snapshot.mjs',
  'windows-android-lab-receive.mjs',
  'windows-android-lab-runtime-update.mjs',
  'windows-android-lab-selfcheck.mjs',
  'windows-android-lab-state.mjs',
  'windows-android-lab-worker.mjs'
];

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function runChecked(runCommand, command, args, code) {
  const result = runCommand(command, args);
  if (result?.code !== undefined && result.code !== 0) {
    throw codedError(code, String(result.output || result.lines?.join('\n') || `${command} failed`).trim());
  }
  return result?.output || '';
}

function requireFile(filePath, code) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw codedError(code, `required Android Lab runtime path is missing: ${filePath}`);
  }
}

function fileSha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function updateAndroidLabRuntime({ command, config, paths, runCommand }) {
  const nodePath = path.join(config.nodeDirectory || '', 'node.exe');
  requireFile(config.gitPath, 'android_lab_runtime_git_missing');
  requireFile(nodePath, 'android_lab_runtime_node_missing');
  requireFile(path.join(paths.repository, 'HEAD'), 'android_lab_runtime_source_missing');
  runChecked(runCommand, config.gitPath, [
    '--git-dir', paths.repository, 'merge-base', '--is-ancestor',
    command.commitSha, WINDOWS_ANDROID_LAB_SOURCE_REF
  ], 'commit_not_in_lab_ref');
  for (const file of WINDOWS_ANDROID_LAB_RUNTIME_FILES) {
    const content = runChecked(runCommand, config.gitPath, [
      '--git-dir', paths.repository, 'show', `${command.commitSha}:scripts/windows/${file}`
    ], 'android_lab_runtime_source_missing');
    fs.writeFileSync(path.join(paths.root, file), content, 'utf8');
  }
  runChecked(runCommand, nodePath, ['--check', path.join(paths.root, 'windows-android-lab-worker.mjs')], 'worker_syntax_failed');
  runChecked(runCommand, nodePath, ['--check', path.join(paths.root, 'windows-android-lab-dispatcher.mjs')], 'dispatcher_syntax_failed');
  return {
    commitSha: command.commitSha,
    dispatcherSha256: fileSha256(path.join(paths.root, 'windows-android-lab-dispatcher.mjs')),
    fileCount: WINDOWS_ANDROID_LAB_RUNTIME_FILES.length,
    schemaVersion: 1,
    stateSha256: fileSha256(path.join(paths.root, 'windows-android-lab-state.mjs')),
    status: 'updated'
  };
}
