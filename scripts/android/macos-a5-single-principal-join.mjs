import { waitForMacosDeviceRequest } from './macos-sync-group-desktop-session.mjs';

export async function observeAndAccept(session, options = {}) {
  const request = await waitForMacosDeviceRequest(session, null, options);
  const before = await session.load();
  const previousDeviceIds = new Set(before.sync_group?.devices?.map(
    (device) => device.device_identity_key
  ) ?? []);
  const expectedDeviceCount = (before.sync_group?.devices?.length ?? 0) + 1;
  await session.accept(request.request_id);
  const overview = await session.load();
  if (overview.sync_group?.devices?.length !== expectedDeviceCount) {
    throw new Error('Mac did not persist the next Device.');
  }
  const joinedDevice = overview.sync_group.devices.find(
    (device) => !previousDeviceIds.has(device.device_identity_key)
  );
  if (!joinedDevice) throw new Error('Mac did not identify the next Device.');
  return { acceptedRequestId: request.request_id,
    deviceCount: overview.sync_group.devices.length,
    deviceId: joinedDevice.device_identity_key, deviceName: request.device_name,
    groupId: overview.sync_group.group_id,
    serverPort: overview.server_status.port };
}
