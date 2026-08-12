import fs from 'node:fs';
import path from 'node:path';

import {
  WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS
} from '../windows/windows-sync-group-provider-release-control.mjs';

/* global process */

const PROVIDER_ACTIONS = Object.freeze({
  'multi-device-sync-a-leave': {
    controllerAction: 'windows-c-a-leave', label: 'A-leave', missingPrefix: 'windows_a_leave',
    progressMilestone: 'c-fact-created'
  },
  'multi-device-sync-a-rejoin': {
    controllerAction: 'windows-c-a-rejoin', label: 'A-rejoin', missingPrefix: 'windows_a_rejoin'
  }
});

function controllerFailure(message, missingFact) {
  return Object.assign(new Error(message), {
    failureOwner: 'controller', host: 'windows-c', missingFact
  });
}

function providerFailure(result, spec) {
  if (result.error) {
    return Object.assign(result.error, {
      failureOwner: result.error.failureOwner || 'controller', host: result.error.host || 'windows-c',
      missingFact: result.error.missingFact || `${spec.missingPrefix}_action_failed`
    });
  }
  if (result.value.code === 0) return null;
  const detail = (result.value.stderr || result.value.stdout || '').trim().split(/\r?\n/u).at(-1);
  return Object.assign(controllerFailure(
    `Windows C ${spec.label} action failed${detail ? `: ${detail}` : '.'}`,
    result.value.terminationReason || `${spec.missingPrefix}_action_failed`
  ), { result: result.value });
}

function actionSpec(action) {
  const spec = PROVIDER_ACTIONS[action];
  if (!spec) throw controllerFailure('Windows C provider action is invalid.',
    'windows_provider_action_invalid');
  return spec;
}

function receiptFromResult(result, repoRoot, action, spec) {
  const expression = new RegExp(
    `^\\[windows-dev-action\\] ${action} identity=([A-Za-z0-9.-]{1,96})`, 'mu'
  );
  const identity = expression.exec(result.output)?.[1];
  if (!identity) throw controllerFailure(`Windows C ${spec.label} action did not report fixed evidence.`,
    `${spec.missingPrefix}_receipt_missing`);
  const evidenceRef = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c', identity,
    `${action}-receipt.json`);
  if (!fs.existsSync(evidenceRef)) throw controllerFailure(`Windows C ${spec.label} receipt is missing.`,
    `${spec.missingPrefix}_receipt_missing`);
  return { evidenceRef, receipt: JSON.parse(fs.readFileSync(evidenceRef, 'utf8')) };
}

export function startWindowsSyncGroupProvider({ action, execute, reportProgress = () => {}, repoRoot }) {
  const spec = actionSpec(action);
  let providerFactId = null;
  const work = execute(process.execPath, ['scripts/windows/windows-dev-control.mjs', action], {
    action: spec.controllerAction, cwd: repoRoot, host: 'windows-c',
    onOutput: ({ stdout }) => {
      if (!spec.progressMilestone || providerFactId) return;
      const expression = new RegExp(`^\\[windows-dev-action\\] progress action=${action}`
        + ' nonce=[0-9a-f-]{36} milestone=c-fact-created'
        + ' fact=(multi-device-sync-c-\\d{17})$', 'mu');
      providerFactId = expression.exec(stdout)?.[1] ?? null;
      if (providerFactId) reportProgress(spec.progressMilestone);
    }, timeoutMs: 15 * 60_000
  }).then((value) => ({ value }), (error) => ({ error }));
  let releaseSent = false;
  const release = async (status) => {
    if (releaseSent) return;
    const releaseAction = WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS[status];
    if (!releaseAction) throw controllerFailure('Windows C provider release status is invalid.',
      'windows_provider_release_status_invalid');
    const released = await execute(process.execPath,
      ['scripts/windows/windows-dev-control.mjs', releaseAction], {
        action: 'windows-c-provider-release', cwd: repoRoot, host: 'windows-c', timeoutMs: 30_000
      });
    if (released.code !== 0) throw controllerFailure('Windows C provider release action failed.',
      'windows_provider_release_action_failed');
    releaseSent = true;
  };
  const finish = async () => {
    const result = await work;
    const failure = providerFailure(result, spec);
    if (failure) throw failure;
    return receiptFromResult(result.value, repoRoot, action, spec);
  };
  const raceConsumer = (consumer) => Promise.race([consumer, work.then((result) => {
    const failure = providerFailure(result, spec);
    throw failure || controllerFailure(`Windows C ${spec.label} provider ended before consumer completion.`,
      `${spec.missingPrefix}_provider_ended_early`);
  })]);
  const cancelAndSettle = async () => {
    await release('cancelled').catch(() => undefined);
    await work;
  };
  const confirmProgress = (factId) => {
    if (providerFactId && providerFactId !== factId) {
      throw controllerFailure('Windows C provider progress reported a different fact identity.',
        `${spec.missingPrefix}_progress_identity_mismatch`);
    }
    if (!providerFactId && spec.progressMilestone) {
      providerFactId = factId; reportProgress(spec.progressMilestone);
    }
  };
  return { cancelAndSettle, confirmProgress, finish, raceConsumer, release };
}
