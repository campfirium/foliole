export function assertMacosAnchorReady(overview) {
  const status = overview?.server_status;
  if (status?.state !== 'running' || status?.topology_status !== 'ready') {
    throw Object.assign(new Error('Mac Sync Group provider is not ready.'), {
      serverStatus: status ?? null
    });
  }
  return { role: status.topology_role, status: status.topology_status };
}

export async function observeMacosAnchorAfterElection(session, {
  timeoutMs = 15_000
} = {}) {
  const overview = await session.waitForState({
    command: 'load_sync_group_overview',
    condition: { kind: 'sync-group-topology', role: null, status: 'ready' },
    eventName: 'onSyncGroupOverviewChanged',
    timeoutMs
  });
  return assertMacosAnchorReady(overview);
}
