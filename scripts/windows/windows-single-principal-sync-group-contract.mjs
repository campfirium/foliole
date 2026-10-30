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
