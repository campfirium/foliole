/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { checked } from './macos-a5-process.mjs';
import { withMacosA5BuildRoot } from './macos-a5-execution-context.mjs';

const OWNER_FILE = 'owner.json';

function capsuleOwner(context) {
  return { acceptedRevision: context.acceptedRevision, action: context.action,
    pid: process.pid, runId: context.runId, schemaVersion: 1 };
}

function assertCapsulePath(context, capsuleRoot) {
  const capsulesRoot = path.join(context.controllerStateRoot, 'capsules');
  if (path.dirname(capsuleRoot) !== capsulesRoot
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
  const capsulesRoot = path.join(context.controllerStateRoot, 'capsules');
  fsApi.mkdirSync(capsulesRoot, { recursive: true });
  const capsuleRoot = fsApi.mkdtempSync(path.join(capsulesRoot, `${context.runId}-`));
  assertCapsulePath(context, capsuleRoot);
  const buildRoot = path.join(capsuleRoot, 'source');
  const archivePath = path.join(capsuleRoot, 'source.tar');
  fsApi.mkdirSync(buildRoot);
  fsApi.writeFileSync(path.join(capsuleRoot, OWNER_FILE),
    `${JSON.stringify(capsuleOwner(context), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const capsule = withMacosA5BuildRoot(context, buildRoot, capsuleRoot);
  let stage = 'archive';
  try {
    onStage(stage);
    run('git', ['archive', '--format=tar', `--output=${archivePath}`,
      context.acceptedRevision], { cwd: context.sourceRepoRoot });
    stage = 'extract';
    onStage(stage);
    run('tar', ['-xf', archivePath, '-C', buildRoot], { cwd: capsuleRoot });
    fsApi.unlinkSync(archivePath);
    stage = 'dependencies';
    onStage(stage);
    run('npm', ['ci'], { cwd: buildRoot });
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
