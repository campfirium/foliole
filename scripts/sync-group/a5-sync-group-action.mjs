import fs from 'node:fs';
import path from 'node:path';

import {
  runMacosA5InstrumentationMechanics
} from '../android/macos-a5-sync-group-maintenance-action.mjs';

const APP_ID = 'com.foliole.android';
const SPECS = Object.freeze({
  'activate-participation': ['activatesSyncParticipationThroughProduct', 'activated', false, true],
  'clear-app-data': ['clearsAppDataThroughProduct', 'appDataCleared', false, false],
  'control-participation': ['controlsSyncParticipationThroughProduct', 'resumed', false, true],
  'create-journey-fact': ['createsJourneyFactThroughProduct', 'factPersisted', false, true],
  'leave-sync-group': ['leavesSyncGroupThroughProduct', 'departurePersisted', true, false],
  'pause-and-leave': ['pausesAndLeavesSyncGroupThroughProduct', 'departurePersisted', true, false],
  'pause-participation': ['pausesSyncParticipationThroughProduct', 'paused', false, false],
  'resume-participation': ['resumesSyncParticipationThroughProduct', 'resumed', false, true],
  'sync-now': ['syncsNowThroughProduct', 'terminalRunId', true, false]
});

function proofFailure(message, details = {}) {
  return Object.assign(new Error(message), {
    failureAxis: 'proof', host: 'android-b', ...details
  });
}

function bundle(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw proofFailure(`Instrumentation did not emit ${key}`, {
    missingFact: 'product_action_observation'
  });
  try { return JSON.parse(line.slice(prefix.length)); }
  catch { throw proofFailure(`Instrumentation emitted invalid ${key}`, {
    missingFact: 'product_action_observation'
  }); }
}

function validateProductResult(receipt, expected, evidenceRef) {
  const failed = expected === 'terminalRunId'
    ? receipt.actionStarted !== true || typeof receipt[expected] !== 'string'
      || receipt[expected] !== receipt.actionRunId || receipt.terminalResult !== 'completed'
    : receipt[expected] !== true;
  if (failed) throw proofFailure(`Product result did not prove ${expected}`, {
    evidenceRef, missingFact: expected, productError: receipt.errorText,
    terminalResult: receipt.terminalResult
  });
}

export async function runMacosA5SyncGroupMaintenance({
  action, buildIdentity, env, evidenceRoot, execute, installMain = true,
  mechanics = runMacosA5InstrumentationMechanics, observeWhileTransportOpen, paths, serial
}) {
  const spec = SPECS[action];
  if (!spec) throw proofFailure('Unsupported sync group action', {
    missingFact: 'scenario_action_binding'
  });
  const [method, expected, needsTransport, restartApp, releaseAfterObservation = false] = spec;
  const testClass = `${APP_ID}.FolioleCompanionSyncGroupMaintenanceTest#${method}`;
  const raw = await mechanics({ buildIdentity, env, evidenceRoot, execute, installMain,
    needsTransport, observeWhileTransportOpen, paths, releaseAfterObservation,
    restartApp, serial, testClass,
    validateInstrumentation: ({ evidencePath, stdout }) => validateProductResult(
      bundle(stdout, 'folioleActionReceipt'), expected, evidencePath
    ) });
  const receipt = bundle(raw.stdout, 'folioleActionReceipt');
  validateProductResult(receipt, expected, raw.evidencePath);
  const manifestPath = path.join(evidenceRoot, 'sync-group-maintenance-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ action,
    after: bundle(raw.stdout, 'folioleAfterSemantic'), buildIdentity,
    completedAt: new Date().toISOString(), rawEvidence: raw.evidencePath,
    receipt, resultStatus: 'success', serial, testClass
  }, null, 2)}\n`, 'utf8');
  return { manifestPath, observation: raw.observation, output: raw.output };
}
