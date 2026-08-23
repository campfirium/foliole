/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { MACOS_DAILY_DEBUG_ROOT } from '../macos/macos-electron-dev-paths.mjs';

const RUN_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const RUN_OWNER_FILE = 'owner.json';

function resolveArtifactsRoot(sourceRepoRoot, fsApi) {
  const temporaryRoot = path.join(sourceRepoRoot, '.tmp');
  try {
    return path.join(fsApi.realpathSync(temporaryRoot), 'artifacts');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return path.join(temporaryRoot, 'artifacts');
  }
}

function resolveSourceRepoRoot(repoRoot, fsApi) {
  const absoluteRoot = path.resolve(repoRoot);
  try {
    return fsApi.realpathSync(absoluteRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return absoluteRoot;
  }
}

export function createMacosA5ExecutionContext({
  acceptedRevision = null, acceptedTree = null, action, formalSourceClass = null,
  fsApi = fs, repoRoot, requiresHiddenDesktopRuntime = false, runId = randomUUID()
}) {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Invalid macOS A5 run identity.');
  const sourceRepoRoot = resolveSourceRepoRoot(repoRoot, fsApi);
  const controllerStateRoot = path.join(
    sourceRepoRoot, '.lab/internal/macos-a5-controller'
  );
  return Object.freeze({
    action,
    acceptedRevision,
    acceptedTree,
    artifactsRoot: resolveArtifactsRoot(sourceRepoRoot, fsApi),
    buildRoot: sourceRepoRoot,
    controllerStateRoot,
    desktopDevLibrary: path.join(controllerStateRoot, 'desktop-library'),
    desktopRuntimeRoot: path.join(sourceRepoRoot, MACOS_DAILY_DEBUG_ROOT),
    deviceBackupRoot: path.join(sourceRepoRoot, '.lab/internal/android-device-backups'),
    leaseRoot: path.join(controllerStateRoot, 'leases'),
    runId,
    runRoot: path.join(controllerStateRoot, 'runs', runId),
    formalSourceClass,
    requiresHiddenDesktopRuntime,
    sourceRepoRoot
  });
}

export function withMacosA5BuildRoot(context, buildRoot, capsuleRoot, sourceArchiveDigest) {
  return Object.freeze({ ...context, buildRoot, capsuleRoot, sourceArchiveDigest });
}

function runOwner(context) {
  return {
    action: context.action,
    pid: process.pid,
    runId: context.runId,
    schemaVersion: 1,
    startedAt: new Date().toISOString()
  };
}

function assertOwnedRun(context, fsApi) {
  const markerPath = path.join(context.runRoot, RUN_OWNER_FILE);
  const owner = JSON.parse(fsApi.readFileSync(markerPath, 'utf8'));
  if (owner.runId !== context.runId || owner.pid !== process.pid) {
    throw new Error('Refusing to clean a macOS A5 run owned by another process.');
  }
  return markerPath;
}

export function openMacosA5Run(context, fsApi = fs) {
  const runsRoot = path.join(context.controllerStateRoot, 'runs');
  if (path.dirname(context.runRoot) !== runsRoot
    || path.basename(context.runRoot) !== context.runId) {
    throw new Error('Unsafe macOS A5 run root.');
  }
  fsApi.mkdirSync(runsRoot, { recursive: true });
  fsApi.mkdirSync(context.runRoot);
  try {
    fsApi.writeFileSync(
      path.join(context.runRoot, RUN_OWNER_FILE),
      `${JSON.stringify(runOwner(context), null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' }
    );
  } catch (error) {
    fsApi.rmdirSync(context.runRoot);
    throw error;
  }
  return context;
}

export function closeMacosA5Run(context, fsApi = fs) {
  const markerPath = assertOwnedRun(context, fsApi);
  const entries = fsApi.readdirSync(context.runRoot);
  if (entries.length !== 1 || entries[0] !== RUN_OWNER_FILE) {
    throw new Error('Refusing to clean a non-empty macOS A5 run root.');
  }
  fsApi.unlinkSync(markerPath);
  fsApi.rmdirSync(context.runRoot);
}
