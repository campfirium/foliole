/* global process */

import fs from 'node:fs';
import path from 'node:path';

import {
  runWindowsSyncGroupInteractiveEnvelope
} from './windows-sync-group-interactive-action.mjs';
import { WINDOWS_NATIVE_CLIENT_TASK } from './windows-client-native-interactive-state.mjs';

const XML_ENTITIES = new Map([
  ['&amp;', '&'], ['&apos;', "'"], ['&gt;', '>'], ['&lt;', '<'], ['&quot;', '"']
]);

function xmlValue(xml, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'u').exec(xml);
  if (!match) throw new Error(`FolioleNativeClient task XML omitted ${tag}`);
  return match[1].replace(/&(amp|apos|gt|lt|quot);/gu, (entity) => XML_ENTITIES.get(entity));
}

export async function inspectRouteSelfcheckTaskAction(options) {
  const queried = await options.execute('schtasks.exe',
    ['/Query', '/TN', WINDOWS_NATIVE_CLIENT_TASK, '/XML'], {
      cwd: options.paths.repoRoot, timeoutCode: 'sync_group_interactive_query_timeout',
      timeoutMs: 30_000, windowsHide: true
    });
  if (queried.code !== 0) throw new Error('FolioleNativeClient task query failed.');
  const expectedWorker = path.join(options.paths.repoRoot, 'scripts', 'windows',
    'windows-sync-group-interactive-worker.mjs');
  const taskAction = { arguments: xmlValue(queried.output, 'Arguments'),
    command: xmlValue(queried.output, 'Command'),
    workingDirectory: xmlValue(queried.output, 'WorkingDirectory') };
  if (taskAction.command !== process.execPath || taskAction.arguments !== `"${expectedWorker}"`
      || taskAction.workingDirectory !== options.paths.repoRoot) {
    throw new Error('FolioleNativeClient task action is not the formal interactive worker.');
  }
  return { ...taskAction, resultStatus: 'verified', workerScript: expectedWorker };
}

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
  const positiveEnvelope = await dispatch('product-launch');
  const positive = assertTerminal(positiveEnvelope, 0, 'positive');
  const taskAction = await inspectRouteSelfcheckTaskAction(options);
  const actionResult = positiveEnvelope.actionResult;
  const manifestPath = path.join(options.evidenceRoot,
    'desktop-dnssd-route-controller-selfcheck-receipt.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    artifacts: { productLaunch: 'selfcheck-product-launch.json',
      negativeError: 'selfcheck-negative-error.json' },
    completedAt: new Date().toISOString(), negative, positive, taskAction,
    resultStatus: 'success', runtimeRoot: options.paths.repoRoot, schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { ...actionResult, desktopDnsSdRouteControllerSelfcheck: { manifestPath }, output: '' };
}
