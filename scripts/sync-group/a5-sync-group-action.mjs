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
  'fork-conflict': ['forksConflictThroughProduct', 'conflictForkPersisted', false, false],
  'leave-sync-group': ['leavesSyncGroupThroughProduct', 'departurePersisted', true, false],
  'observe-journey-facts': ['observesJourneyFactsThroughProduct', 'journeyFactsObserved', false, false],
  'pause-and-leave': ['pausesAndLeavesSyncGroupThroughProduct', 'departurePersisted', true, false],
  'pause-participation': ['pausesSyncParticipationThroughProduct', 'paused', false, false],
  'resume-participation': ['resumesSyncParticipationThroughProduct', 'resumed', false, true],
  'read-sync-events': ['projectsSyncEventsForAcceptance', 'syncEventsProjected', false, false],
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
  if (expected !== 'terminalRunId' && receipt[expected] !== true) {
    throw proofFailure(`Product result did not prove ${expected}`, {
      evidenceRef, missingFact: expected, productError: receipt.errorText
    });
  }
  if (expected !== 'terminalRunId') return;
  if (receipt.actionStarted !== true || typeof receipt.terminalRunId !== 'string'
      || receipt.terminalRunId !== receipt.actionRunId) {
    throw proofFailure('Product result did not prove the matching Sync Now run', {
      evidenceRef, missingFact: 'terminalRunId', productError: receipt.errorText,
      terminalResult: receipt.terminalResult
    });
  }
  if (receipt.terminalResult !== 'completed') {
    throw proofFailure(`Public Sync Now failed${receipt.errorText ? `: ${receipt.errorText}` : '.'}`, {
      evidenceRef, missingFact: 'terminalResultCompleted', productError: receipt.errorText,
      terminalResult: receipt.terminalResult
    });
  }
}

export async function runMacosA5SyncGroupMaintenance({
  action, appId, buildIdentity, env, evidenceRoot, execute, installMain = true,
  conflictToken, expectedJourneyCounts, mechanics = runMacosA5InstrumentationMechanics,
  observeWhileTransportOpen, paths, serial
}) {
  const spec = SPECS[action];
  if (!spec) throw proofFailure('Unsupported sync group action', {
    missingFact: 'scenario_action_binding'
  });
  const [method, expected, needsTransport, restartApp, releaseAfterObservation = false] = spec;
  const className = action === 'read-sync-events'
    ? 'FolioleAcceptanceSyncEventProjectionTest' : action === 'observe-journey-facts'
      ? 'FolioleAcceptanceJourneyFactsTest' : action === 'fork-conflict'
        ? 'FolioleAcceptanceConflictForkTest' : 'FolioleCompanionSyncGroupMaintenanceTest';
  const testClass = `${APP_ID}.${className}#${method}`;
  const instrumentationArgs = action === 'observe-journey-facts'
    ? ['-e', 'expectedJourneyCounts', `'${JSON.stringify(expectedJourneyCounts ?? {})}'`]
    : action === 'fork-conflict' ? ['-e', 'conflictToken', conflictToken ?? ''] : [];
  const raw = await mechanics({ appId, buildIdentity, env, evidenceRoot, execute, installMain,
    instrumentationArgs, needsTransport, observeWhileTransportOpen, paths, releaseAfterObservation,
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
