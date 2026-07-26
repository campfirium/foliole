/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { resolveAndroidDevice, validateAndroidLabConfig } from './windows-android-lab-device.mjs';
import { runWindowsAndroidLabReviewPhase } from './windows-android-lab-review-action.mjs';
import { readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const COMMAND_TIMEOUT_MS = 10 * 60_000;
const REVIEW_ACTIONS = [
  { name: 'reveal', testId: 'companion-review-action-reveal' },
  { name: 'grade-again', testId: 'companion-review-grade-1' },
  { name: 'read', testId: 'companion-review-action-read' },
  { name: 'later', testId: 'companion-review-action-later' },
  { name: 'dismiss', testId: 'companion-review-action-dismiss' }
];

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function childRequest(request, phase) {
  return { ...request, evidenceRunId: path.join(request.runId, phase), reviewPhase: phase };
}

function scenarioEvidenceRoot(paths, request, name) {
  const root = path.join(paths.evidence, request.runId, name);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function scenarioEnv(config, endpoint, paths, evidenceRoot) {
  const tools = [config.nodeDirectory, path.win32.dirname(config.adbPath)].filter(Boolean).join(';');
  return {
    ...process.env,
    ANDROID_USER_HOME: paths.signingHome,
    ANDROID_WINDOWS_WORKDIR: paths.preview,
    FOLIOLE_ANDROID_ADB_PATH: config.adbPath,
    FOLIOLE_ANDROID_BASH_PATH: config.bashPath,
    FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT: evidenceRoot,
    FOLIOLE_ANDROID_SERIAL: endpoint,
    JAVA_HOME: config.javaHome,
    Path: `${tools};${process.env.Path || process.env.PATH || ''}`
  };
}

async function runChecked(executeCommand, command, args, options, code) {
  const result = await executeCommand(command, args, {
    timeoutCode: `${code}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS, ...options
  });
  if (result.code !== 0) throw codedError(code, result.lines?.at(-1) || `${command} exited ${result.code}`);
  return result;
}

async function runUiAction({ config, device, executeCommand, paths, request, step }) {
  const evidenceRoot = scenarioEvidenceRoot(paths, request, `ui-${step.name}`);
  await runChecked(executeCommand, path.join(config.nodeDirectory, 'node.exe'), [
    path.join(paths.preview, 'scripts', 'windows', 'windows-android-lab-ui-automation.mjs'),
    '--testId', step.testId, '--expectedAttribute', '__actionAccepted', '--expectedValue', 'true'
  ], {
    cwd: paths.preview,
    env: scenarioEnv(config, device.endpoint, paths, evidenceRoot)
  }, `review_ui_${step.name}_failed`);
  return { evidencePath: path.relative(path.join(paths.evidence, request.runId), evidenceRoot), name: step.name, testId: step.testId };
}

async function runWindowsClientSyncCheck({ config, executeCommand, paths, request }) {
  const evidenceRoot = scenarioEvidenceRoot(paths, request, 'windows-sync');
  const result = await runChecked(executeCommand, path.join(config.nodeDirectory, 'node.exe'), [
    path.join(paths.preview, 'scripts', 'windows', 'windows-client-native.mjs'), 'status'
  ], { cwd: paths.preview }, 'review_windows_sync_status_failed');
  fs.writeFileSync(path.join(evidenceRoot, 'stdout.txt'), result.output || result.lines?.join('\n') || '', 'utf8');
  return { evidencePath: 'windows-sync', operation: 'windows-client-status' };
}

export async function runWindowsAndroidLabReviewScenario({ executeCommand, paths, request, setPhase = () => {} }) {
  const config = validateAndroidLabConfig(readJson(paths.config));
  setPhase('scenario_prepare');
  await runWindowsAndroidLabReviewPhase({ executeCommand, paths, request: childRequest(request, 'prepare'), setPhase });
  setPhase('scenario_device_resolve');
  const device = await resolveAndroidDevice(config, paths, executeCommand);
  const ui = [];
  for (const step of REVIEW_ACTIONS) {
    setPhase(`scenario_ui_${step.name}`);
    ui.push(await runUiAction({ config, device, executeCommand, paths, request, step }));
  }
  setPhase('scenario_capture');
  await runWindowsAndroidLabReviewPhase({ executeCommand, paths, request: childRequest(request, 'capture'), setPhase });
  setPhase('scenario_restart');
  await runWindowsAndroidLabReviewPhase({ executeCommand, paths, request: childRequest(request, 'restart'), setPhase });
  setPhase('scenario_windows_sync');
  const windows = await runWindowsClientSyncCheck({ config, executeCommand, paths, request });
  const summary = {
    commitSha: request.commitSha,
    phases: ['prepare', 'ui', 'capture', 'restart', 'windows-sync'],
    resultStatus: 'success',
    runId: request.runId,
    schemaVersion: 1,
    ui,
    windows
  };
  writeJsonAtomic(path.join(paths.evidence, request.runId, 'summary.json'), summary);
  return summary;
}

export async function finishWindowsAndroidLabReviewScenarioRun({ executeCommand, paths, request, running, runScenario }) {
  let primaryError = null;
  try {
    await runScenario({ executeCommand, paths, request, setPhase: (phase) => {
      writeJsonAtomic(paths.status, { ...running, phase });
    } });
  } catch (error) {
    primaryError = error;
    const evidenceRoot = path.join(paths.evidence, request.runId);
    fs.mkdirSync(evidenceRoot, { recursive: true });
    writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), {
      commitSha: request.commitSha, errorCode: error.code || 'review_scenario_failed',
      errorMessage: error.message, resultStatus: 'failure', runId: request.runId, schemaVersion: 1
    });
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
