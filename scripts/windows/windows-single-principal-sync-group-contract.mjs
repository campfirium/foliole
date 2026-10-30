export function assertJoinedWindowsGroup(overview, groupId) {
  const group = overview.sync_group;
  if (group?.group_id !== groupId || group.devices.length < 2
      || !group.devices.some((device) =>
        device.device_identity_key === group.local_device_identity_key)) {
    throw new Error('Windows did not persist its local Device in the accepted Sync Group.');
  }
  return group;
}

export function completedAutomatic(result, previousRunId, startedAfter) {
  return result?.reason === 'automatic' && result.status === 'completed' && result.run_id
    && result.run_id !== previousRunId && (startedAfter === undefined
      || Date.parse(result.started_at) >= Date.parse(startedAfter)) ? result : null;
}

export async function readCompletedAutomatic(session) {
  const latest = completedAutomatic(await session.loadSyncTriggerResult());
  if (latest) return latest;
  const diagnostics = await session.invoke('load_desktop_sync_diagnostics');
  const event = diagnostics?.activity?.find(value => value.kind === 'run_finished'
    && value.trigger_reason === 'automatic' && value.status === 'completed'
    && value.result === 'completed' && value.run_id && value.started_at && value.occurred_at);
  return event ? { error: null, reason: 'automatic', status: 'completed', run_id: event.run_id,
    started_at: event.started_at, finished_at: event.occurred_at } : null;
}

export function assertAutomaticCoverage(runs) {
  for (const phase of ['automaticBeforeRestart', 'automaticAfterRestart']) {
    if (!Object.values(runs).some(value => completedAutomatic(value?.[phase],
      phase === 'automaticAfterRestart' ? value?.automaticBeforeRestart?.run_id : undefined))) {
      throw new Error('Both desktops lack a new completed automatic round: ' + phase);
    }
  }
}

export async function loadDesktopPeerConflict(session, nodeId) {
  const fragments = ['Cloze target alpha', 'Note target beta',
    'Desktop fork macos', 'Desktop fork windows'];
  const preview = await session.waitForState({ command: 'load_node_text_alternative_preview',
    commandArgs: { node_id: nodeId }, condition: { kind: 'body-alternative-preview', nodeId, fragments },
    eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000 });
  return { conflictCount: preview.alternatives.length, nodeId, resolution: 'body-alternatives',
    silentOverwrite: false, visible: true };
}

export function completedInitialRun(activity = []) {
  const event = activity.find(value => value.kind === 'run_finished'
    && value.trigger_reason === 'initial' && value.status === 'completed'
    && value.result === 'completed' && value.run_id && value.occurred_at && value.started_at);
  if (!event) throw new Error('Windows initial sync did not complete in the persisted activity.');
  return { error: null, reason: 'initial', status: 'completed', run_id: event.run_id,
    started_at: event.started_at, finished_at: event.occurred_at };
}

export async function runAvailableManualSync(session) {
  const before = await session.invoke('load_desktop_sync_diagnostics');
  const previous = new Set((before?.activity ?? []).filter(value => value.kind === 'run_finished')
    .map(value => value.run_id));
  try { await session.invoke('sync_companion_now'); }
  catch (error) {
    if (/\bsync_group_peer_unavailable\b/u.test(String(error?.message))) return null;
    throw error;
  }
  const after = await session.invoke('load_desktop_sync_diagnostics');
  const fresh = (after?.activity ?? []).filter(value => value.kind === 'run_finished'
    && ['manual', 'automatic'].includes(value.trigger_reason) && value.run_id
    && !previous.has(value.run_id) && value.started_at && value.occurred_at);
  const event = fresh.find(value => value.trigger_reason === 'manual') ?? fresh[0];
  if (!event) throw new Error('No new completed run for the manual sync action');
  const status = event.status === 'completed' && event.result === 'completed' ? 'completed'
    : event.result === 'partial' ? 'pending' : event.status === 'failed' ? 'failed' : 'skipped';
  return { error: status === 'failed' ? event.message : null,
    reason: event.trigger_reason, status, run_id: event.run_id,
    started_at: event.started_at, finished_at: event.occurred_at };
}

export function assertManualCoverage(runs) {
  for (const phase of ['manualBeforeRestart', 'manualAfterRestart']) {
    if (!Object.values(runs).some(value => value?.[phase]?.status === 'completed')) {
      throw new Error('Both desktops lack a completed manual action: ' + phase);
    }
  }
}
