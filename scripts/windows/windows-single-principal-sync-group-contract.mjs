export function assertJoinedWindowsGroup(overview, groupId) {
  const group = overview.sync_group;
  if (group?.group_id !== groupId || group.devices.length < 2
      || !group.devices.some((device) =>
        device.device_identity_key === group.local_device_identity_key)) {
    throw new Error('Windows did not persist its local Device in the accepted Sync Group.');
  }
  return group;
}

export function completedAutomatic(result, previousRunId) {
  return result?.reason === 'automatic' && result.status === 'completed'
    && result.run_id !== previousRunId ? result : null;
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
