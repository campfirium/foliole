export function assertJoinedWindowsGroup(overview, groupId) {
  const group = overview.sync_group;
  if (group?.group_id !== groupId || group.devices.length < 2
      || !group.devices.some((device) =>
        device.device_identity_key === group.local_device_identity_key)) {
    throw new Error('Windows did not persist its local Device in the accepted Sync Group.');
  }
  return group;
}
