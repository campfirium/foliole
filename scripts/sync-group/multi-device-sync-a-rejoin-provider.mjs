import fs from 'node:fs';
import path from 'node:path';

import {
  WINDOWS_DEV_DEFAULT_SSH, windowsDevScpSpec
} from '../windows/windows-dev-control.mjs';

/* global process */

const REMOTE_RELEASE_PATH = 'C:/dev/foliole-android-lab-preview/.tmp/'
  + 'windows-sync-group-interactive/provider-release.json';

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

export function startWindowsARejoinProvider({ evidenceRoot, execute, repoRoot }) {
  const work = execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-a-rejoin'], {
    action: 'windows-c-a-rejoin', cwd: repoRoot, host: 'windows-c', timeoutMs: 15 * 60_000
  }).then((value) => ({ value }), (error) => ({ error }));
  let releaseSent = false;
  const release = async (status) => {
    if (releaseSent) return;
    const releasePath = path.join(evidenceRoot, 'windows-provider-release.json');
    fs.writeFileSync(releasePath, `${JSON.stringify({
      action: 'multi-device-sync-a-rejoin', schemaVersion: 1, status
    }, null, 2)}\n`, 'utf8');
    const host = process.env.FOLIOLE_WINDOWS_DEV_SSH || WINDOWS_DEV_DEFAULT_SSH;
    const copied = await execute('scp', windowsDevScpSpec(host, releasePath, REMOTE_RELEASE_PATH), {
      action: 'windows-c-provider-release', cwd: repoRoot, host: 'windows-c', timeoutMs: 30_000
    });
    if (copied.code !== 0) throw controllerFailure('Windows C provider release transfer failed.',
      'windows_provider_release_transfer_failed');
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
