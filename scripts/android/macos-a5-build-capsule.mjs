/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { frozenNpmCiArgs } from '../lib/frozen-npm-cache.mjs';

import { checked } from './macos-a5-process.mjs';
import { withMacosA5BuildRoot } from './macos-a5-execution-context.mjs';

const OWNER_FILE = 'owner.json';
// Capsules and sealed templates live together on the external APFS volume so a template
// clones copy-on-write; without the volume, runs build on the internal disk uncached.
export const MACOS_A5_BUILD_VOLUME = '/Volumes/UD';
export const MACOS_A5_SHARED_BUILD_ROOT = path.join(MACOS_A5_BUILD_VOLUME, 'Foliole/a5-build');

function internalCapsulesRoot(context) {
  return path.join(context.controllerStateRoot, 'capsules');
}

function mountedVolume(volume, fsApi) {
  try {
    return fsApi.statSync(volume).dev !== fsApi.statSync(path.dirname(volume)).dev;
  } catch { return false; }
}

export function macosA5BuildStorage(context, {
  fsApi = fs, root = MACOS_A5_SHARED_BUILD_ROOT, volume = MACOS_A5_BUILD_VOLUME
} = {}) {
  const internal = { capsulesRoot: internalCapsulesRoot(context), shared: false, templatesRoot: null };
  if (!mountedVolume(volume, fsApi)) return { ...internal, reason: `${volume} is not mounted` };
  try {
    fsApi.mkdirSync(path.join(root, 'capsules'), { recursive: true });
    return { capsulesRoot: path.join(root, 'capsules'), shared: true,
      templatesRoot: path.join(root, 'build-templates') };
  } catch (error) {
    return { ...internal, reason: `${root} is unavailable: ${error.message}` };
  }
}

export function macosA5CapsulesRoot(context) {
  return context.buildStorage?.capsulesRoot ?? internalCapsulesRoot(context);
}

function materializeHiddenElectronRuntime(context, fsApi, run) {
  if (!context.requiresHiddenDesktopRuntime) return;
  const installScript = path.join(context.buildRoot, 'node_modules/electron/install.js');
  const executable = path.join(context.buildRoot,
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  if (!fsApi.existsSync(installScript)) {
    throw new Error('Locked Electron on-demand installer is missing from the build capsule.');
  }
  run(process.execPath, [installScript, '--no'], { cwd: context.buildRoot });
  if (!fsApi.existsSync(executable)) {
    throw new Error('Locked Electron runtime was not materialized inside the build capsule.');
  }
}

function rebuildHiddenElectronModules(context, onStage, run) {
  if (!context.requiresHiddenDesktopRuntime) return;
  for (const [stage, script] of [
    ['electron-sqlite-rebuild', 'electron:rebuild:native'],
    ['electron-security-bookmarks-rebuild', 'macos:security-bookmarks:build']
  ]) {
    onStage(stage);
    run('npm', ['run', script], { cwd: context.buildRoot });
  }
}

function capsuleOwner(context) {
  return { acceptedRevision: context.acceptedRevision, action: context.action,
    pid: process.pid, runId: context.runId, schemaVersion: 1 };
}

function assertCapsulePath(context, capsuleRoot) {
  const allowedRoots = [internalCapsulesRoot(context), macosA5CapsulesRoot(context)];
  if (!allowedRoots.includes(path.dirname(capsuleRoot))
      || !path.basename(capsuleRoot).startsWith(`${context.runId}-`)) {
    throw new Error('Unsafe macOS A5 build capsule root.');
  }
}

function assertOwnedCapsule(context, fsApi) {
  const markerPath = path.join(context.capsuleRoot, OWNER_FILE);
  const owner = JSON.parse(fsApi.readFileSync(markerPath, 'utf8'));
  if (owner.runId !== context.runId || owner.pid !== process.pid
      || owner.acceptedRevision !== context.acceptedRevision) {
    throw new Error('Refusing to clean a macOS A5 build capsule owned by another run.');
  }
}

function preserveCapsuleFailure(context, stage, error, fsApi) {
  const evidenceRoot = path.join(context.artifactsRoot, 'macos-a5-formal', context.runId);
  fsApi.mkdirSync(evidenceRoot, { recursive: true });
  fsApi.writeFileSync(path.join(evidenceRoot, 'capsule-failure.json'), `${JSON.stringify({
    acceptedRevision: context.acceptedRevision, acceptedTree: context.acceptedTree,
    action: context.action, message: error instanceof Error ? error.message : String(error),
    resultStatus: 'failed', runId: context.runId, schemaVersion: 1, stage
  }, null, 2)}\n`, 'utf8');
}

export function openMacosA5BuildCapsule(context, {
  fsApi = fs, onStage = () => {}, run = checked
} = {}) {
  if (context.formalSourceClass !== 'frozen-build' || !context.acceptedRevision) {
    throw new Error('A frozen accepted revision is required for a build capsule.');
  }
  const capsulesRoot = macosA5CapsulesRoot(context);
  fsApi.mkdirSync(capsulesRoot, { recursive: true });
  const capsuleRoot = fsApi.mkdtempSync(path.join(capsulesRoot, `${context.runId}-`));
  assertCapsulePath(context, capsuleRoot);
  const buildRoot = path.join(capsuleRoot, 'source');
  const archivePath = path.join(capsuleRoot, 'source.tar');
  fsApi.mkdirSync(buildRoot);
  fsApi.writeFileSync(path.join(capsuleRoot, OWNER_FILE),
    `${JSON.stringify(capsuleOwner(context), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  let capsule = withMacosA5BuildRoot(context, buildRoot, capsuleRoot, null);
  let stage = 'archive';
  try {
    onStage(stage);
    run('git', ['archive', '--format=tar', `--output=${archivePath}`,
      context.acceptedRevision], { cwd: context.sourceRepoRoot });
    const sourceArchiveDigest = createHash('sha256')
      .update(fsApi.readFileSync(archivePath)).digest('hex');
    capsule = withMacosA5BuildRoot(
      context, buildRoot, capsuleRoot, sourceArchiveDigest
    );
    stage = 'extract';
    onStage(stage);
    run('tar', ['-xf', archivePath, '-C', buildRoot], { cwd: capsuleRoot });
    fsApi.unlinkSync(archivePath);
    stage = 'dependencies';
    onStage(stage);
    run('npm', frozenNpmCiArgs(context.sourceRepoRoot), { cwd: buildRoot });
    if (context.requiresHiddenDesktopRuntime) {
      stage = 'electron-runtime';
      onStage(stage);
      materializeHiddenElectronRuntime(capsule, fsApi, run);
      rebuildHiddenElectronModules(capsule, (nextStage) => {
        stage = nextStage;
        onStage(stage);
      }, run);
    }
    return capsule;
  } catch (error) {
    try { preserveCapsuleFailure(context, stage, error, fsApi); }
    finally { closeMacosA5BuildCapsule(capsule, fsApi); }
    throw error;
  }
}

export function closeMacosA5BuildCapsule(context, fsApi = fs) {
  if (!context.capsuleRoot) return;
  assertCapsulePath(context, context.capsuleRoot);
  assertOwnedCapsule(context, fsApi);
  fsApi.rmSync(context.capsuleRoot, { recursive: true });
}
