#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  androidLabPaths, androidLabRoot, readJson, WINDOWS_ANDROID_LAB_SOURCE_REF
} from './windows-android-lab-state.mjs';

const COMMIT_SHA = /^[0-9a-f]{40}$/u;
export const FORMAL_DEV_REF = 'refs/remotes/origin/dev';

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function runChecked(runCommand, command, args, code) {
  const result = runCommand(command, args);
  if (result?.code !== undefined && result.code !== 0) {
    throw codedError(code, String(result.output || result.lines?.join('\n') || `${command} failed`).trim());
  }
  return String(result?.output || '').trim();
}

function assertFixedPaths(paths) {
  if (path.resolve(paths.repository) !== path.resolve(paths.root, 'repository.git')) {
    throw codedError('lab_maintenance_path_rejected', 'maintenance repository must be the fixed Lab repository');
  }
  if (!fs.existsSync(path.join(paths.repository, 'HEAD'))) {
    throw codedError('lab_source_missing', 'LAN Git source repository is missing');
  }
}

export async function assertFormalDevCommit(targetSha, executeGit, env) {
  if (!COMMIT_SHA.test(targetSha)) throw new Error('Android Lab formal commit is invalid');
  const verified = String(await executeGit(['rev-parse', '--verify', `${targetSha}^{commit}`], { env })).trim();
  if (verified !== targetSha) throw new Error('Android Lab formal commit is invalid');
  await executeGit(['rev-parse', '--verify', `${FORMAL_DEV_REF}^{commit}`], { env });
  await executeGit(['merge-base', '--is-ancestor', targetSha, FORMAL_DEV_REF], { env });
}

export function repairAndroidLabSourceRef({ command, config, paths, runCommand }) {
  const { expectedOldSha, targetSha } = command;
  if (!COMMIT_SHA.test(targetSha) || !COMMIT_SHA.test(expectedOldSha)) {
    throw codedError('lab_maintenance_sha_rejected', 'maintenance requires two exact commit SHAs');
  }
  if (!config?.gitPath) throw codedError('lab_maintenance_git_missing', 'Android Lab Git configuration is missing');
  assertFixedPaths(paths);
  const objectType = runChecked(runCommand, config.gitPath, [
    '--git-dir', paths.repository, 'cat-file', '-t', targetSha
  ], 'lab_maintenance_target_missing');
  if (objectType !== 'commit') throw codedError('lab_maintenance_target_not_commit', 'maintenance target is not a commit');
  runChecked(runCommand, config.gitPath, [
    '--git-dir', paths.repository, 'update-ref', '-m', 'repair Windows Android Lab source ref',
    WINDOWS_ANDROID_LAB_SOURCE_REF, targetSha, expectedOldSha
  ], 'lab_maintenance_expected_old_mismatch');
  const updated = runChecked(runCommand, config.gitPath, [
    '--git-dir', paths.repository, 'rev-parse', '--verify', WINDOWS_ANDROID_LAB_SOURCE_REF
  ], 'lab_maintenance_verify_failed');
  if (updated !== targetSha) throw codedError('lab_maintenance_verify_failed', 'Lab ref did not reach the formal commit');
  return {
    commitSha: targetSha, expectedOldSha, operation: 'repair-ref', ref: WINDOWS_ANDROID_LAB_SOURCE_REF,
    schemaVersion: 1, sourceKind: 'formal', status: 'updated'
  };
}

function runProcess(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, timeout: 30_000 });
  return { code: result.status ?? 1, output: result.stdout || result.stderr || '' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [operation, targetSha, expectedOldSha] = process.argv.slice(2);
    if (operation !== 'repair-ref' || process.argv.length !== 5) {
      throw new Error('usage: windows-android-lab-ref-maintenance.mjs repair-ref <formal SHA> <expected old SHA>');
    }
    const paths = androidLabPaths(androidLabRoot({ ...process.env, FOLIOLE_WINDOWS_ANDROID_LAB_ROOT: undefined }));
    const result = repairAndroidLabSourceRef({
      command: { expectedOldSha, targetSha }, config: readJson(paths.config), paths, runCommand: runProcess
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || 'lab_maintenance_failed', message: error.message, schemaVersion: 1 }));
    process.exitCode = 1;
  }
}
