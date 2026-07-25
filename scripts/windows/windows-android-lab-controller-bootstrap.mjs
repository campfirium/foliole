#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTROLLER_FILES = [
  'windows-android-lab-state.mjs',
  'windows-android-lab-dispatcher.mjs',
  'windows-android-lab-worker.mjs'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, ''));
}

function resolveLabRoot(backupRoot) {
  const resolved = path.win32.resolve(backupRoot || '');
  const root = path.win32.dirname(path.win32.dirname(resolved));
  if (resolved.toLowerCase() !== path.win32.join(root, 'protection', 'backups').toLowerCase()
    || path.win32.basename(root).toLowerCase() !== 'windows-android-lab') {
    throw new Error('bootstrap requires the fixed Windows Android Lab protection path');
  }
  return root;
}

function runGit(gitPath, args) {
  const result = spawnSync(gitPath, args, { encoding: 'utf8', shell: false, timeout: 30_000 });
  if (result.status !== 0) throw new Error(String(result.stderr || 'git validation failed').trim());
  return result.stdout.trim();
}

function validateCandidate(labRoot, candidateRoot) {
  const config = readJson(path.win32.join(labRoot, 'config.json'));
  const status = readJson(path.win32.join(labRoot, 'status.json'));
  if (status.state !== 'running' || !/^[0-9a-f]{40}$/u.test(status.commitSha || '')) {
    throw new Error('bootstrap requires an active commit-bound Android Lab run');
  }
  const head = runGit(config.gitPath, ['-C', candidateRoot, 'rev-parse', 'HEAD']);
  const dirty = runGit(config.gitPath, ['-C', candidateRoot, 'status', '--porcelain']);
  if (head !== status.commitSha || dirty) throw new Error('bootstrap candidate does not match the clean active commit');
  return status.commitSha;
}

export function bootstrapWindowsAndroidLabController({
  backupRoot, candidateRoot = process.cwd(), platform = process.platform
}) {
  if (platform !== 'win32') throw new Error('bootstrap requires Windows');
  const labRoot = resolveLabRoot(backupRoot);
  const commitSha = validateCandidate(labRoot, candidateRoot);
  for (const name of CONTROLLER_FILES) {
    const source = path.join(candidateRoot, 'scripts', 'windows', name);
    const destination = path.win32.join(labRoot, name);
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, destination);
  }
  return { commitSha, files: CONTROLLER_FILES.length, schemaVersion: 1, state: 'installed' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(bootstrapWindowsAndroidLabController({ backupRoot: process.argv[2] })));
  } catch (error) {
    console.error(`[windows-android-lab-controller-bootstrap] ${error.message}`);
    process.exitCode = 1;
  }
}
