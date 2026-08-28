/* global AbortSignal, fetch */

import { setTimeout as delay } from 'node:timers/promises';

import { browse as startSystemBrowse } from '@foliole/desktop-dnssd';

import {
  fingerprintSecretFreeCandidate, T132_A5_AUTHORIZATION, T132_GROUP_ID, T132_TIMELINE_ID
} from './macos-a5-sync-group-rejoin-contract.mjs';

const SERVICE_TYPE = 'foliole-sync';

function serviceHost(service) {
  return service.addresses?.find((value) => /^\d+\.\d+\.\d+\.\d+$/u.test(value)) ?? null;
}

function expectedA5Service(service) {
  const txt = service.txt ?? {};
  return txt.group_id === T132_GROUP_ID && txt.timeline_id === T132_TIMELINE_ID
    && fingerprintSecretFreeCandidate(String(txt.authorization_id ?? '')).slice(0, 16)
      === T132_A5_AUTHORIZATION;
}

async function probeA5Provider(service, fetchProvider) {
  const host = serviceHost(service);
  if (!host || !service.port || !expectedA5Service(service)) return null;
  try {
    const response = await fetchProvider(`http://${host}:${service.port}/companion/discovery`, {
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const authorization = fingerprintSecretFreeCandidate(
      String(payload.provider_authorization_id ?? '')
    ).slice(0, 16);
    if (payload.group_id !== T132_GROUP_ID || payload.timeline_id !== T132_TIMELINE_ID
      || authorization !== T132_A5_AUTHORIZATION) return null;
    return {
      authorization, groupId: payload.group_id, reachable: true,
      timelineId: payload.timeline_id
    };
  } catch {
    return null;
  }
}

export async function observeT132A5Provider({
  durationMs = 5_000, fetchProvider = fetch, startBrowse = startSystemBrowse
} = {}) {
  let proof = null;
  const probes = new Set();
  const collect = (event) => {
    if (event.kind !== 'found' && event.kind !== 'changed') return;
    const service = event.service;
    const probe = probeA5Provider(service, fetchProvider).then((candidate) => {
      if (candidate) proof = candidate;
    }).finally(() => probes.delete(probe));
    probes.add(probe);
  };
  const browser = startBrowse({ domain: 'local.', type: `_${SERVICE_TYPE}._tcp` }, collect);
  await delay(durationMs);
  browser.stop();
  await Promise.allSettled([...probes]);
  return proof;
}

export function assertT132A5ProviderAvailability(proof, expectedPresent) {
  if (Boolean(proof?.reachable) !== expectedPresent) throw new Error(expectedPresent
    ? 'Foreground A5 provider was not reachable.' : 'Stopped A5 provider remained reachable.');
  return proof ?? { authorization: T132_A5_AUTHORIZATION, reachable: false };
}
