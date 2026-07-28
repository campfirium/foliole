import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { readJson, WINDOWS_ANDROID_LAB_SOURCE_REF, writeJsonAtomic } from './windows-android-lab-state.mjs';

const GENERATOR_OWNED_TRACKED = [
  'android/app/capacitor.build.gradle',
  'android/capacitor.settings.gradle',
  'android/app/src/main/assets/capacitor.config.json',
  'android/app/src/main/assets/capacitor.plugins.json',
  'android/app/src/main/res/xml/config.xml'
];

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

function checkoutRoot(paths) {
  return paths.checkout || paths.preview || paths.candidate;
}

function resolveWithin(root, relativePath = '') {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw codedError('checkout_path_escape', 'checkout path escaped root');
  return resolved;
}

function normalizeStatusPath(line) {
  const value = line.slice(3).trim().replace(/\\/gu, '/');
  return (value.split(' -> ').at(-1) || value).replace(/^"|"$/gu, '');
}

function isGeneratorOwned(line) {
  if (line.startsWith('?? ')) return true;
  const filePath = normalizeStatusPath(line);
  return GENERATOR_OWNED_TRACKED.some((owned) => filePath === owned || filePath.startsWith(`${owned}/`));
}

async function isRecordedCheckoutContent(config, paths, checkout, line, executeCommand, options) {
  const checkoutState = readJson(paths.checkoutState);
  if (!/^[0-9a-f]{40}$/u.test(checkoutState?.checkoutHead || '')) return false;
  const filePath = normalizeStatusPath(line);
  const worktreeHash = await executeCommand(config.gitPath, isolatedGitArgs(paths, [
    'hash-object', resolveWithin(checkout, filePath)
  ]), { timeoutCode: 'checkout_stale_hash_timeout', timeoutMs: 5 * 60_000, ...options });
  const recordedHash = await executeCommand(config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'rev-parse', `${checkoutState.checkoutHead}:${filePath}`
  ]), { timeoutCode: 'checkout_stale_hash_timeout', timeoutMs: 5 * 60_000, ...options });
  return worktreeHash.code === 0 && recordedHash.code === 0 && worktreeHash.output.trim() === recordedHash.output.trim();
}

async function isBlockedCheckoutLine(config, paths, checkout, line, executeCommand, options) {
  return !isGeneratorOwned(line) && !await isRecordedCheckoutContent(config, paths, checkout, line, executeCommand, options);
}

export async function prepareAndroidLabCheckout(config, paths, commitSha, executeCommand, sourceKind = 'unknown') {
  const checkout = checkoutRoot(paths);
  const options = { env: process.env };
  if (!fs.existsSync(path.join(paths.repository, 'HEAD'))) throw codedError('lab_source_missing', 'LAN Git source repository is missing');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'cat-file', '-e', `${commitSha}^{commit}`
  ]), options, 'commit_missing');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'merge-base', '--is-ancestor', commitSha, WINDOWS_ANDROID_LAB_SOURCE_REF
  ]), options, 'commit_not_in_lab_ref');
  fs.mkdirSync(checkout, { recursive: true });
  const before = await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, '--work-tree', checkout, 'status', '--porcelain', '--untracked-files=no'
  ]), options, 'checkout_status_failed');
  const blocked = [];
  for (const line of before.output.split(/\r?\n/u).filter(Boolean)) {
    if (await isBlockedCheckoutLine(config, paths, checkout, line, executeCommand, options)) blocked.push(line);
  }
  if (blocked.length > 0) throw codedError('checkout_dirty', `Windows checkout has tracked source changes: ${blocked[0]}`);
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, '--work-tree', checkout, 'checkout', '--force', commitSha, '--', '.'
  ]), options, 'checkout_failed');
  const status = await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, '--work-tree', checkout, 'status', '--porcelain', '--untracked-files=no'
  ]), options, 'checkout_status_failed');
  const remaining = status.output.split(/\r?\n/u).filter(Boolean).filter((line) => !isGeneratorOwned(line));
  if (remaining.length > 0) throw codedError('checkout_dirty', `Windows checkout has tracked source changes: ${remaining[0]}`);
  writeJsonAtomic(paths.checkoutState, {
    checkoutHead: commitSha,
    dirty: status.output.trim() ? 'generator_owned' : 'clean',
    path: checkout,
    schemaVersion: 1,
    sourceKind,
    updatedAt: new Date().toISOString()
  });
}

export async function cleanupAndroidLabCheckout(config, paths, executeCommand) {
  void config;
  void paths;
  void executeCommand;
}
