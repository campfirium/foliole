import fs from 'node:fs';
import path from 'node:path';

import { resolveAndroidDevice, validateAndroidLabConfig } from './windows-android-lab-device.mjs';
import { pullAndroidReviewSnapshot } from './windows-android-lab-review-snapshot.mjs';
import { readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const APP_ID = 'com.foliole.android';
const APP_COMPONENT = `${APP_ID}/com.foliole.android.MainActivity`;
const COMMAND_TIMEOUT_MS = 5 * 60_000;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertBinding(value, expected, code, label) {
  if (value !== expected) throw codedError(code, `${label} does not match the requested deployment`);
}

function readDeploymentBinding(paths, request) {
  const deployment = readJson(paths.deployment);
  const workspace = readJson(paths.workspaceDeployment);
  if (!deployment || !workspace) throw codedError('review_deployment_missing', 'successful deployment markers are required');
  for (const marker of [deployment, workspace]) {
    assertBinding(marker.commitSha, request.commitSha, 'review_commit_mismatch', 'deployment commit');
    assertBinding(marker.runId, deployment.runId, 'review_workspace_mismatch', 'workspace deployment');
    assertBinding(marker.deviceIdentity, deployment.deviceIdentity, 'review_identity_mismatch', 'deployment identity');
  }
  return deployment;
}

function readAcceptanceSession(paths, request, deployment) {
  if (request.reviewPhase === 'prepare') return null;
  const session = readJson(paths.reviewSession);
  if (!session) throw codedError('review_session_missing', 'review prepare must complete before this phase');
  assertBinding(session.commitSha, request.commitSha, 'review_session_commit_mismatch', 'review session commit');
  assertBinding(session.deploymentRunId, deployment.runId, 'review_session_deployment_mismatch', 'review session deployment');
  assertBinding(session.deviceIdentity, deployment.deviceIdentity, 'review_session_identity_mismatch', 'review session identity');
  return session;
}

async function checked(executeCommand, command, args, options, code) {
  const result = await executeCommand(command, args, {
    timeoutCode: `${code}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS, ...options
  });
  if (result.code !== 0) throw codedError(code, result.lines?.at(-1) || `${command} exited ${result.code}`);
  return result;
}

async function restartApplication(config, endpoint, paths, executeCommand, setPhase) {
  setPhase('restart_force_stop');
  await checked(executeCommand, config.adbPath, ['-s', endpoint, 'shell', 'am', 'force-stop', APP_ID], {}, 'review_force_stop_failed');
  setPhase('restart_reverse');
  await checked(executeCommand, config.adbPath, ['-s', endpoint, 'reverse', 'tcp:38641', 'tcp:38641'], {}, 'review_reverse_failed');
  setPhase('restart_launch');
  await checked(executeCommand, config.adbPath, ['-s', endpoint, 'shell', 'am', 'start', '-n', APP_COMPONENT], {}, 'review_launch_failed');
  setPhase('restart_verify');
  await checked(executeCommand, path.join(config.nodeDirectory, 'node.exe'), [
    path.join(paths.preview, 'scripts', 'android', 'verify-android-launch.mjs'),
    '--adb', config.adbPath, '--serial', endpoint, '--app-id', APP_ID, '--component', APP_COMPONENT,
    '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { cwd: paths.preview }, 'review_launch_verify_failed');
}

function assertAuditRuntime(paths) {
  const required = [
    path.join(paths.preview, 'scripts', 'electron-sqlite-runner.mjs'),
    path.join(paths.preview, 'scripts', 'windows', 'windows-android-lab-review-audit.ts'),
    path.join(paths.preview, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(paths.preview, 'node_modules', 'better-sqlite3')
  ];
  if (required.some((entry) => !fs.existsSync(entry))) {
    throw codedError('review_audit_runtime_missing', 'deployed Electron ABI audit runtime is missing; rerun normal deployment');
  }
}

async function runAudit({ config, databasePath, deployment, evidenceRoot, executeCommand, paths, request, session }) {
  assertAuditRuntime(paths);
  const output = path.join(evidenceRoot, 'review-audit.json');
  const args = [
    path.join(paths.preview, 'scripts', 'electron-sqlite-runner.mjs'),
    path.join(paths.preview, 'scripts', 'windows', 'windows-android-lab-review-audit.ts'),
    '--checkpoint', request.reviewPhase, '--commit', request.commitSha, '--database', databasePath,
    '--deployment-run', deployment.runId, '--device', deployment.deviceIdentity,
    '--output', output, '--run', request.runId,
    ...(session ? ['--session', paths.reviewSession] : [])
  ];
  const result = await executeCommand(path.join(config.nodeDirectory, 'node.exe'), args, {
    cwd: paths.preview, timeoutCode: 'review_audit_failed_timeout', timeoutMs: COMMAND_TIMEOUT_MS
  });
  fs.writeFileSync(path.join(evidenceRoot, 'runner.log'), `${result.lines?.join('\n') || ''}\n`, 'utf8');
  const audit = readJson(output);
  if (result.code !== 0) {
    throw codedError(audit?.errorCode || 'review_audit_failed',
      result.lines?.at(-1) || audit?.scheduler?.error || audit?.acceptance?.error || `audit exited ${result.code}`);
  }
  if (!audit || audit.resultStatus !== 'success') throw codedError('review_audit_invalid', 'audit result is unavailable or incomplete');
  return audit;
}

function persistPrepareSession(paths, request, deployment, audit) {
  if (!audit?.selected?.fsrsNodeId || audit.selected.readingNodeIds?.length < 3) {
    throw codedError('review_audit_invalid', 'prepare audit did not select the required acceptance objects');
  }
  writeJsonAtomic(paths.reviewSession, {
    commitSha: request.commitSha, createdAt: new Date().toISOString(), deploymentRunId: deployment.runId,
    deviceIdentity: deployment.deviceIdentity, fsrsNodeId: audit.selected.fsrsNodeId,
    prepareRunId: request.runId, readingNodeIds: audit.selected.readingNodeIds, schemaVersion: 1
  });
}

function writeReviewSummary(evidenceRoot, request, deployment, audit) {
  writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), {
    checkpoint: request.reviewPhase, commitSha: request.commitSha, deploymentRunId: deployment.runId,
    deviceIdentity: deployment.deviceIdentity, resultStatus: 'success', runId: request.runId,
    schemaVersion: 1, selectedObjectCount: 1 + audit.selected.readingNodeIds.length
  });
}

function writeFailureEvidence(paths, request, error) {
  const evidenceRoot = path.join(paths.evidence, request.runId);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const output = path.join(evidenceRoot, 'review-audit.json');
  const deployment = readJson(paths.deployment);
  if (!fs.existsSync(output)) {
    const unavailable = { error: 'database audit did not start or did not produce evidence', status: 'unavailable' };
    writeJsonAtomic(output, {
      acceptance: unavailable, capturedAt: new Date().toISOString(), checkpoint: request.reviewPhase,
      commitSha: request.commitSha, deploymentRunId: deployment?.runId ?? null,
      deviceIdentity: deployment?.deviceIdentity ?? null, errorCode: error.code || 'review_phase_failed',
      errorMessage: error.message, fsrs: unavailable, pairing: unavailable, reading: [], resultStatus: 'failure',
      runId: request.runId, scheduler: unavailable, schemaVersion: 2, selected: null, sync: unavailable
    });
  }
  const runnerLog = path.join(evidenceRoot, 'runner.log');
  if (!fs.existsSync(runnerLog)) fs.writeFileSync(runnerLog, `${error.code || 'review_phase_failed'}: ${error.message}\n`, 'utf8');
  writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), {
    checkpoint: request.reviewPhase, commitSha: request.commitSha, deploymentRunId: deployment?.runId ?? null,
    deviceIdentity: deployment?.deviceIdentity ?? null, errorCode: error.code || 'review_phase_failed',
    resultStatus: 'failure', runId: request.runId, schemaVersion: 1
  });
}

export async function runWindowsAndroidLabReviewPhase({
  executeCommand, paths, pullSnapshot = pullAndroidReviewSnapshot, request, setPhase = () => {}
}) {
  const config = validateAndroidLabConfig(readJson(paths.config));
  const deployment = readDeploymentBinding(paths, request);
  const session = readAcceptanceSession(paths, request, deployment);
  setPhase('device_resolve');
  const device = await resolveAndroidDevice(config, paths, executeCommand);
  assertBinding(device.identity, deployment.deviceIdentity, 'review_identity_mismatch', 'resolved device identity');
  if (request.reviewPhase === 'restart') await restartApplication(config, device.endpoint, paths, executeCommand, setPhase);
  const evidenceRoot = path.join(paths.evidence, request.runId);
  const snapshotRoot = path.join(paths.root, `review-snapshot-${request.runId}`);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  try {
    setPhase('database_snapshot');
    const databasePath = await pullSnapshot({ adbPath: config.adbPath, destination: snapshotRoot, endpoint: device.endpoint });
    setPhase('review_audit');
    const audit = await runAudit({ config, databasePath, deployment, evidenceRoot, executeCommand, paths, request, session });
    if (request.reviewPhase === 'prepare') persistPrepareSession(paths, request, deployment, audit);
    writeReviewSummary(evidenceRoot, request, deployment, audit);
    return audit;
  } finally {
    fs.rmSync(snapshotRoot, { force: true, recursive: true });
  }
}

export async function finishWindowsAndroidLabReviewRun({ executeCommand, paths, request, runReviewPhase, running }) {
  let primaryError = null;
  try {
    await runReviewPhase({ executeCommand, paths, request, setPhase: (phase) => {
      writeJsonAtomic(paths.status, { ...running, phase });
    } });
  } catch (error) {
    primaryError = error;
    writeFailureEvidence(paths, request, error);
  }
  const completed = {
    ...running, completedAt: new Date().toISOString(), errorCode: primaryError?.code,
    errorMessage: primaryError?.message?.slice(0, 500), phase: 'completed',
    resultStatus: primaryError ? 'failure' : 'success', state: 'completed'
  };
  writeJsonAtomic(paths.status, completed);
  const active = readJson(paths.active);
  if (active?.runId === request.runId) fs.rmSync(paths.active, { force: true });
  if (primaryError) throw primaryError;
  return completed;
}
