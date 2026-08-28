import { projectedEvents, selectProjectedRun } from '../acceptance/t152-two-device-run-proof.mjs';

function selectPair(events, triggerReason) {
  const afterRestart = selectProjectedRun(events, triggerReason);
  const beforeRestart = selectProjectedRun(events, triggerReason, { exclude: [afterRestart] });
  if (beforeRestart.deviceIdentityKey !== afterRestart.deviceIdentityKey) {
    throw new Error(`Fri ${triggerReason} runs came from different Device identities.`);
  }
  return { afterRestart, beforeRestart };
}

export function buildFriRunTimeline(projection, applicationId) {
  const events = projectedEvents(projection, applicationId);
  const initial = selectProjectedRun(events, 'initial');
  const automatic = selectPair(events, 'automatic');
  const manual = selectPair(events, 'manual');
  const identities = [initial, automatic.beforeRestart, automatic.afterRestart,
    manual.beforeRestart, manual.afterRestart].map(({ deviceIdentityKey }) => deviceIdentityKey);
  if (new Set(identities).size !== 1) {
    throw new Error('Fri projected Sync runs are not bound to one Device identity.');
  }
  return { identity: initial.deviceIdentityKey, runs: {
    automaticAfterRestart: automatic.afterRestart,
    automaticBeforeRestart: automatic.beforeRestart,
    initial, manualAfterRestart: manual.afterRestart,
    manualBeforeRestart: manual.beforeRestart
  } };
}
