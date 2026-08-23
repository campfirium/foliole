import { setTimeout as delay } from 'node:timers/promises';

import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';
import {
  assertExactFactConvergence, factObservation
} from './sync-scenario-predicate.mjs';

export function productFailure(host, missingFact, message) {
  return Object.assign(new Error(message), {
    failureOwner: 'product', host, missingFact, status: 'stalled'
  });
}

export async function waitUntil(
  label, inspect, accept, missingFact, progress = (value) => value, intervalMs = 1_000
) {
  const deadline = Date.now() + 60_000;
  const observe = createSyncProgressWatchdog({ label, stallMs: 60_000 });
  let value;
  while (Date.now() < deadline) {
    value = await inspect();
    observe(JSON.stringify(progress(value)));
    if (accept(value)) return value;
    await delay(intervalMs);
  }
  throw productFailure('all', missingFact, `${label} did not converge.`);
}

function originForKey(key) {
  const match = /([ABC])$/u.exec(key);
  if (!match) throw new Error(`Unknown exact fact origin: ${key}`);
  return match[1];
}

function desktopObservation(facts, mutations) {
  return factObservation(Object.fromEntries(mutations
    .filter(({ factId }) => facts?.facts?.[factId] === true || facts?.journeyFacts?.[factId])
    .map(({ factId, origin }) => [factId, origin])));
}

export function assertThreeDeviceProof({ android, macos, windows, ids, requiredAttachmentId,
  runId }) {
  const androidFacts = android.database?.inspection;
  const points = [macos, windows];
  const mutations = Object.entries(ids).map(([key, factId]) => ({
    factId, origin: originForKey(key), runId
  }));
  const observations = [desktopObservation(macos, mutations),
    desktopObservation(windows, mutations), factObservation(androidFacts?.journeyFacts)];
  const desktopHasAttachment = !requiredAttachmentId || points.every((value) =>
    value.availableAttachmentIds?.includes(requiredAttachmentId));
  const androidHasAttachment = !requiredAttachmentId
    || androidFacts?.availableAttachmentIds?.includes(requiredAttachmentId);
  try {
    assertExactFactConvergence({ mutations,
      observations: { received: observations, restarted: observations } });
  } catch (error) {
    throw productFailure('all', 'three_device_restart_convergence_missing', error.message);
  }
  if (!desktopHasAttachment || !androidHasAttachment) {
    throw productFailure('all', 'three_device_restart_convergence_missing',
      'A, B, and C did not preserve the exact journey attachment.');
  }
  return { factIds: mutations.map(({ factId }) => factId), requiredAttachmentId, restarted: true,
    runId };
}

export async function waitForThreeDeviceProof({ ids, inspect, intervalMs = 1_000,
  requiredAttachmentId, runId }) {
  const result = await waitUntil('A, B, and C restarted convergence', async () => {
    const evidence = await inspect();
    try {
      return { evidence, proof: assertThreeDeviceProof({
        ...evidence, ids, requiredAttachmentId, runId
      }) };
    } catch (error) {
      if (error?.missingFact !== 'three_device_restart_convergence_missing') throw error;
      return { evidence, proof: null };
    }
  }, (value) => value.proof !== null, 'three_device_restart_convergence_missing',
  ({ evidence }) => ({
    android: evidence.android.database?.inspection,
    macos: evidence.macos,
    windows: evidence.windows
  }), intervalMs);
  return result.proof;
}
