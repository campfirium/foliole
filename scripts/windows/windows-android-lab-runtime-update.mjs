/* global process */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveWindowsAndroidLabRuntimeFiles } from './windows-android-lab-runtime-manifest.mjs';
import { WINDOWS_ANDROID_LAB_SOURCE_REF } from './windows-android-lab-state.mjs';

export const WINDOWS_ANDROID_LAB_RUNTIME_FILES = resolveWindowsAndroidLabRuntimeFiles();
const SYNTAX_CHECK_FILES = [
  'windows-android-lab-dispatcher.mjs',
  'windows-android-lab-receive.mjs',
  'windows-android-lab-runtime-update.mjs',
  'windows-android-lab-selfcheck.mjs',
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

function copyRuntimeFromSource({ commitSha, gitPath, repository, root, runCommand }) {
  fs.rmSync(root, { force: true, recursive: true });
  fs.mkdirSync(root, { recursive: true });
  for (const file of WINDOWS_ANDROID_LAB_RUNTIME_FILES) {
    const content = runChecked(runCommand, gitPath, [
      '--git-dir', repository, 'show', `${commitSha}:scripts/windows/${file}`
    ], 'android_lab_runtime_source_missing');
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
}

export function verifyWindowsAndroidLabRuntimeTree({ nodePath, root, runCommand }) {
  for (const file of WINDOWS_ANDROID_LAB_RUNTIME_FILES) requireFile(path.join(root, file), 'android_lab_runtime_source_missing');
  for (const file of SYNTAX_CHECK_FILES) {
    runChecked(runCommand, nodePath, ['--check', path.join(root, file)], `${path.basename(file, '.mjs')}_syntax_failed`);
  }
}

function replaceRuntimeFiles(paths, stagingRoot) {
  const backupRoot = path.join(paths.root, `.runtime-update-backup-${process.pid}-${Date.now()}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const replaced = [];
  try {
    for (const file of WINDOWS_ANDROID_LAB_RUNTIME_FILES) {
      const target = path.join(paths.root, file);
      const backup = path.join(backupRoot, file);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      if (fs.existsSync(target)) fs.renameSync(target, backup);
      replaced.push({ backup, file, target });
      fs.renameSync(path.join(stagingRoot, file), target);
    }
  } catch (error) {
    for (const entry of replaced.reverse()) {
      fs.rmSync(entry.target, { force: true });
      if (fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.target);
    }
    throw Object.assign(error, { backupRoot, code: error.code || 'android_lab_runtime_replace_failed' });
  }
  return backupRoot;
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
  const stagingRoot = path.join(paths.root, `.runtime-update-staging-${process.pid}-${Date.now()}`);
  copyRuntimeFromSource({
    commitSha: command.commitSha, gitPath: config.gitPath, repository: paths.repository,
    root: stagingRoot, runCommand
  });
  verifyWindowsAndroidLabRuntimeTree({ nodePath, root: stagingRoot, runCommand });
  const backupRoot = replaceRuntimeFiles(paths, stagingRoot);
  fs.rmSync(stagingRoot, { force: true, recursive: true });
  return {
    backupRoot,
    commitSha: command.commitSha,
    dispatcherSha256: fileSha256(path.join(paths.root, 'windows-android-lab-dispatcher.mjs')),
    fileCount: WINDOWS_ANDROID_LAB_RUNTIME_FILES.length,
    schemaVersion: 1,
    stateSha256: fileSha256(path.join(paths.root, 'windows-android-lab-state.mjs')),
    status: 'updated'
  };
}
