import fs from 'node:fs';
import path from 'node:path';

import {
  runWindowsSyncGroupInteractiveEnvelope
} from './windows-sync-group-interactive-action.mjs';

function assertTerminal(envelope, expectedExitCode, label) {
  if (envelope?.state !== 'completed' || envelope.exitCode !== expectedExitCode
      || !Number.isInteger(envelope.workerPid) || envelope.workerPid <= 0) {
    throw new Error(`desktop DNS-SD route ${label} selfcheck did not reach its expected terminal state`);
  }
  return { error: envelope.error ?? null, exitCode: envelope.exitCode,
    nonce: envelope.nonce, state: envelope.state, workerPid: envelope.workerPid };
}

export async function runWindowsDesktopDnsSdRouteSelfcheck(options, dependencies) {
  const dispatch = (selfcheckMode) => runWindowsSyncGroupInteractiveEnvelope({
    ...options, action: 'desktop-dnssd-route-selfcheck', selfcheckMode
  }, dependencies);
  const negative = assertTerminal(await dispatch('missing-runtime'), 1, 'negative');
  if (!negative.error) throw new Error('desktop DNS-SD route negative selfcheck lost its error');
  const positiveEnvelope = await dispatch('native-probe');
  const positive = assertTerminal(positiveEnvelope, 0, 'positive');
  const actionResult = positiveEnvelope.actionResult;
  const manifestPath = path.join(options.evidenceRoot,
    'desktop-dnssd-route-controller-selfcheck-receipt.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    artifacts: { nativeProbeLog: 'selfcheck-native-probe.log',
      negativeError: 'selfcheck-negative-error.json',
      runtimeLog: 'desktop-dnssd-route-runtime/action.log',
      runtimeReceipt: 'desktop-dnssd-route-runtime/receipt.json' },
    completedAt: new Date().toISOString(), negative, positive,
    resultStatus: 'success', runtimeRoot: options.runtimeRepoRoot, schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { ...actionResult, desktopDnsSdRouteControllerSelfcheck: { manifestPath }, output: '' };
}
