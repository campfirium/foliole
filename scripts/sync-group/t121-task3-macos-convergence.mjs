import { setTimeout as delay } from 'node:timers/promises';

import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';

export async function waitForTask3MacFacts(session, requiredIds, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({
    label: 'macOS A task 3 fact convergence', stallMs: 60_000
  });
  let snapshot;
  while (Date.now() < deadline) {
    const overview = await session.load();
    snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    const active = overview.sync_group?.members.filter(({ state }) => state === 'active').length;
    const visible = requiredIds.filter((id) => snapshot.nodesById?.[id]).length;
    observe(JSON.stringify([active, visible]), { activeMemberCount: active, visibleFactCount: visible });
    if (active === 3 && visible === requiredIds.length) return snapshot;
    await delay(1_000);
  }
  throw new Error('macOS A did not converge on the required task 3 facts.');
}

export async function waitForTask3MacMembers(session, timeoutMs = 4 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({
    label: 'macOS A three-member convergence', stallMs: 60_000
  });
  while (Date.now() < deadline) {
    const group = (await session.load()).sync_group;
    const active = group?.members.filter(({ state }) => state === 'active').length ?? 0;
    observe(String(active), { activeMemberCount: active });
    if (active === 3) return group;
    await delay(1_000);
  }
  throw new Error('macOS A did not rejoin the three-member group.');
}
