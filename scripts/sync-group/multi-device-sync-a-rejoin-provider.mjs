import fs from 'node:fs';
import path from 'node:path';

import {
  WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS
} from '../windows/windows-sync-group-provider-release-control.mjs';

/* global process */

function controllerFailure(message, missingFact) {
  return Object.assign(new Error(message), {
    failureOwner: 'controller', host: 'windows-c', missingFact
  });
}

function receiptFromResult(result, repoRoot) {
  const match = /^\[windows-dev-action\] multi-device-sync-a-rejoin identity=([A-Za-z0-9.-]{1,96})/mu
    .exec(result.output);
  if (!match) throw controllerFailure('Windows C A-rejoin action did not report fixed evidence.',
    'windows_a_rejoin_receipt_missing');
  const evidenceRef = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c', match[1],
    'multi-device-sync-a-rejoin-receipt.json');
  if (!fs.existsSync(evidenceRef)) throw controllerFailure('Windows C A-rejoin receipt is missing.',
    'windows_a_rejoin_receipt_missing');
  return { evidenceRef, receipt: JSON.parse(fs.readFileSync(evidenceRef, 'utf8')) };
}

export function freshJourneyFactIds(journeyFacts, excluded) {
  const result = {};
  for (const [id, origin] of Object.entries(journeyFacts ?? {})) {
    if (excluded.has(id) || !['A', 'B', 'C'].includes(origin)) continue;
    if (result[origin]) throw new Error(`Multiple fresh ${origin} facts were observed.`);
    result[origin] = id;
  }
  return result;
}

export function startWindowsARejoinProvider({ execute, repoRoot }) {
  const work = execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-a-rejoin'], {
    action: 'windows-c-a-rejoin', cwd: repoRoot, host: 'windows-c', timeoutMs: 15 * 60_000
  }).then((value) => ({ value }), (error) => ({ error }));
  let releaseSent = false;
  const release = async (status) => {
    if (releaseSent) return;
    const action = WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS[status];
    if (!action) throw controllerFailure('Windows C provider release status is invalid.',
      'windows_provider_release_status_invalid');
    const released = await execute(process.execPath, ['scripts/windows/windows-dev-control.mjs', action], {
      action: 'windows-c-provider-release', cwd: repoRoot, host: 'windows-c', timeoutMs: 30_000
    });
    if (released.code !== 0) throw controllerFailure('Windows C provider release action failed.',
      'windows_provider_release_action_failed');
    releaseSent = true;
  };
  const finish = async () => {
    const result = await work;
    if (result.error) throw result.error;
    if (result.value.code !== 0) throw controllerFailure('Windows C A-rejoin action failed.',
      result.value.terminationReason || 'windows_a_rejoin_action_failed');
    return receiptFromResult(result.value, repoRoot);
  };
  const cancelAndSettle = async () => {
    await release('cancelled').catch(() => undefined);
    await work;
  };
  return { cancelAndSettle, finish, release };
}
