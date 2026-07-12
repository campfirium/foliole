import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { resolveProtectedDesktopPaths } from '../desktop/playwright-desktop-isolation.mjs';

const OWNERSHIP_FILE = '.foliole-validation-owned.json';
const RESULT_FILE = 'result.json';
const STALE_MS = 24 * 60 * 60 * 1000;
const FAILURE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_MAX_COUNT = 3;

function ownedDirectory(directoryPath) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(directoryPath, OWNERSHIP_FILE), 'utf8'));
    return marker?.owner === 'foliole-windows-validation-kit';
  } catch {
    return false;
  }
}

function completedResult(directoryPath) {
  try {
    const result = JSON.parse(fs.readFileSync(path.join(directoryPath, RESULT_FILE), 'utf8'));
    return result?.schemaVersion === 1 && typeof result.completedAt === 'string' ? result : null;
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertSafeExecutionId(executionId) {
  if (!/^[a-z0-9][a-z0-9.-]{0,80}$/u.test(executionId)) throw new Error('invalid validation execution id');
}

function isWindowsPath(value) {
  return /^[a-z]:[\\/]/iu.test(value) || value.startsWith('\\\\');
}

function comparablePath(value) {
  const resolved = isWindowsPath(value) ? path.win32.resolve(value) : path.resolve(value);
  return isWindowsPath(value) || process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function pathsOverlap(left, right) {
  const leftValue = comparablePath(left);
  const rightValue = comparablePath(right);
  const separator = isWindowsPath(left) || isWindowsPath(right) ? '\\' : path.sep;
  return leftValue === rightValue || leftValue.startsWith(`${rightValue}${separator}`) || rightValue.startsWith(`${leftValue}${separator}`);
}

export function assertValidationCacheRoot(cacheRoot, env = process.env) {
  const protectedPath = resolveProtectedDesktopPaths(env).find((candidate) => pathsOverlap(cacheRoot, candidate));
  if (protectedPath) throw new Error(`validation cache root overlaps protected desktop data: ${protectedPath}`);
  return path.resolve(cacheRoot);
}

function removeOwned(directoryPath) {
  if (ownedDirectory(directoryPath)) fs.rmSync(directoryPath, { force: true, recursive: true });
}

export function createValidationCandidate(cacheRoot, executionId, now = new Date()) {
  assertSafeExecutionId(executionId);
  const candidateRoot = path.join(cacheRoot, 'candidate');
  const candidateDir = path.join(candidateRoot, executionId);
  fs.mkdirSync(candidateRoot, { recursive: true });
  if (fs.existsSync(candidateDir)) throw new Error(`validation candidate already exists: ${executionId}`);
  fs.mkdirSync(candidateDir);
  writeJson(path.join(candidateDir, OWNERSHIP_FILE), {
    createdAt: now.toISOString(),
    executionId,
    owner: 'foliole-windows-validation-kit'
  });
  return candidateDir;
}

export function writeValidationResult(candidateDir, result) {
  if (!ownedDirectory(candidateDir)) throw new Error('refusing to write unowned validation result');
  writeJson(path.join(candidateDir, RESULT_FILE), result);
}

export function recoverValidationResultStore(cacheRoot) {
  const backups = fs.existsSync(cacheRoot)
    ? fs.readdirSync(cacheRoot).filter((name) => name.startsWith('.last-passed-backup-')).sort()
    : [];
  const lastPassed = path.join(cacheRoot, 'last-passed');
  for (const name of backups) {
    const backup = path.join(cacheRoot, name);
    if (!ownedDirectory(backup)) continue;
    if (!fs.existsSync(lastPassed)) fs.renameSync(backup, lastPassed);
    else if (completedResult(lastPassed)) removeOwned(backup);
  }
}

export function promoteValidationCandidate(cacheRoot, candidateDir, executionId) {
  if (!ownedDirectory(candidateDir) || !completedResult(candidateDir)) throw new Error('candidate is incomplete');
  const lastPassed = path.join(cacheRoot, 'last-passed');
  const backup = path.join(cacheRoot, `.last-passed-backup-${executionId}`);
  if (fs.existsSync(lastPassed)) fs.renameSync(lastPassed, backup);
  try {
    fs.renameSync(candidateDir, lastPassed);
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(lastPassed)) fs.renameSync(backup, lastPassed);
    throw error;
  }
  removeOwned(backup);
  return lastPassed;
}

function pruneFailures(failuresRoot, nowMs) {
  if (!fs.existsSync(failuresRoot)) return;
  const owned = fs.readdirSync(failuresRoot)
    .map((name) => ({ directory: path.join(failuresRoot, name), name }))
    .filter((entry) => ownedDirectory(entry.directory))
    .map((entry) => ({ ...entry, result: completedResult(entry.directory) }))
    .filter((entry) => entry.result)
    .sort((left, right) => right.result.completedAt.localeCompare(left.result.completedAt));
  for (const [index, entry] of owned.entries()) {
    const expired = nowMs - Date.parse(entry.result.completedAt) > FAILURE_MAX_AGE_MS;
    if (expired || index >= FAILURE_MAX_COUNT) removeOwned(entry.directory);
  }
}

export function archiveValidationFailure(cacheRoot, candidateDir, executionId, now = new Date()) {
  if (!ownedDirectory(candidateDir) || !completedResult(candidateDir)) throw new Error('candidate failure is incomplete');
  const failuresRoot = path.join(cacheRoot, 'failures');
  const failureDir = path.join(failuresRoot, executionId);
  fs.mkdirSync(failuresRoot, { recursive: true });
  fs.renameSync(candidateDir, failureDir);
  pruneFailures(failuresRoot, now.getTime());
  return failureDir;
}

export function archiveStaleCandidates(cacheRoot, now = new Date()) {
  const candidateRoot = path.join(cacheRoot, 'candidate');
  if (!fs.existsSync(candidateRoot)) return [];
  const archived = [];
  for (const name of fs.readdirSync(candidateRoot)) {
    const directory = path.join(candidateRoot, name);
    if (!ownedDirectory(directory)) continue;
    const marker = JSON.parse(fs.readFileSync(path.join(directory, OWNERSHIP_FILE), 'utf8'));
    if (now.getTime() - Date.parse(marker.createdAt) <= STALE_MS) continue;
    writeValidationResult(directory, {
      completedAt: now.toISOString(),
      errorCode: 'interrupted_candidate',
      schemaVersion: 1,
      status: 'failure'
    });
    archived.push(archiveValidationFailure(cacheRoot, directory, name, now));
  }
  return archived;
}
