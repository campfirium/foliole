import { setTimeout as delay } from 'node:timers/promises';

export function assertMacosAnchorReady(overview) {
  const status = overview?.server_status;
  if (status?.topology_role !== 'anchor' || status?.topology_status !== 'ready') {
    throw Object.assign(new Error('Mac did not become the ready Sync Group anchor.'), {
      serverStatus: status ?? null
    });
  }
  return { role: status.topology_role, status: status.topology_status };
}

export async function observeMacosAnchorAfterElection(session, {
  observationMs = 2_500, wait = delay
} = {}) {
  await wait(observationMs);
  return assertMacosAnchorReady(await session.load());
}
