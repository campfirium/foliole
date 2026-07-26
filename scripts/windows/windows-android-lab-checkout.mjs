import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { WINDOWS_ANDROID_LAB_SOURCE_REF } from './windows-android-lab-state.mjs';

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function runChecked(executeCommand, command, args, options, code) {
  const result = await executeCommand(command, args, { timeoutCode: `${code}_timeout`, timeoutMs: 5 * 60_000, ...options });
  if (result.code !== 0) throw codedError(code, result.lines.at(-1) || `${command} exited ${result.code}`);
  return result;
}

function isolatedGitArgs(paths, args) {
  const hooksPath = path.join(paths.root, 'worker-empty-hooks');
  fs.mkdirSync(hooksPath, { recursive: true });
  return ['-c', `core.hooksPath=${hooksPath}`, ...args];
}

export async function prepareAndroidLabCheckout(config, paths, commitSha, executeCommand) {
  const options = { env: process.env };
  if (!fs.existsSync(path.join(paths.repository, 'HEAD'))) throw codedError('lab_source_missing', 'LAN Git source repository is missing');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'cat-file', '-e', `${commitSha}^{commit}`
  ]), options, 'commit_missing');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'merge-base', '--is-ancestor', commitSha, WINDOWS_ANDROID_LAB_SOURCE_REF
  ]), options, 'commit_not_in_lab_ref');
  fs.rmSync(paths.candidate, { force: true, recursive: true });
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'worktree', 'add', '--detach', paths.candidate, commitSha
  ]), options, 'checkout_failed');
  const status = await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '-C', paths.candidate, 'status', '--porcelain'
  ]), options, 'checkout_status_failed');
  if (status.output.trim()) throw codedError('checkout_dirty', 'controller checkout is not clean');
}

export async function cleanupAndroidLabCheckout(config, paths, executeCommand) {
  if (!fs.existsSync(paths.candidate)) return;
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'worktree', 'remove', '--force', paths.candidate
  ]), { env: process.env }, 'checkout_cleanup_failed');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'worktree', 'prune'
  ]), { env: process.env }, 'checkout_cleanup_failed');
}
