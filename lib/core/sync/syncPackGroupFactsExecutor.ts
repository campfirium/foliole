import { createSyncGroupDeviceIdentity } from '../../platform/syncGroupUnifiedContract.js';

import type { DbPort, DbRow } from './dbPort.js';

interface GroupRow extends DbRow {
  created_at: string;
  display_name: string;
  group_id: string;
}

interface DeviceRow extends DbRow {
  canonical_library_path: string;
  device_anchor: string;
  device_identity_key: string;
  device_name: string;
  group_id: string;
  joined_at: string;
  last_seen_at: string | null;
  left_at: string | null;
  platform: string;
  state: 'active' | 'left';
  updated_at: string;
}

export async function applySyncPackGroupFactsWithDbPort(port: DbPort, args: {
  incomingAlias?: string;
  sourcePeerId: string;
}) {
  const alias = identifier(args.incomingAlias ?? 'inc');
  const incomingGroups = await port.query<GroupRow>(`SELECT * FROM ${alias}.sync_groups`);
  if (incomingGroups.length === 0) return { appliedFactCount: 0 };
  if (incomingGroups.length !== 1) throw new Error('sync_group_pack_identity_invalid');
  const incomingGroup = incomingGroups[0]!;
  const [local] = await port.query<GroupRow & { local_device_identity_key: string }>(
    `SELECT g.group_id, g.display_name, g.created_at, l.local_device_identity_key
     FROM main.sync_groups g JOIN main.sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1 LIMIT 1`
  );
  assertSameGroup(local, incomingGroup);
  const [source] = await port.query<DeviceRow>(
    `SELECT * FROM main.sync_group_devices
     WHERE group_id = ? AND device_identity_key = ? AND state = 'active' LIMIT 1`,
    [local.group_id, args.sourcePeerId]
  );
  if (!source) throw new Error('sync_group_source_not_authorized');
  const devices = await port.query<DeviceRow>(`SELECT * FROM ${alias}.sync_group_devices`);
  validateDevices(incomingGroup.group_id, devices);
  const localDevice = devices.find((device) =>
    device.device_identity_key === local.local_device_identity_key);
  if (localDevice?.state === 'left') throw new Error('sync_group_local_departure_requires_local_action');
  for (const device of devices) await mergeDevice(port, device);
  return { appliedFactCount: 1 + devices.length };
}

function assertSameGroup(local: GroupRow | undefined, incoming: GroupRow): asserts local is GroupRow {
  if (!local || ['group_id', 'created_at', 'display_name'].some((key) => local[key] !== incoming[key])) {
    throw new Error('sync_group_identity_mismatch');
  }
}

function validateDevices(groupId: string, devices: DeviceRow[]) {
  const identities = new Set<string>();
  for (const device of devices) {
    if (device.group_id !== groupId || !['active', 'left'].includes(device.state)) {
      throw new Error('sync_group_device_fact_invalid');
    }
    const identity = createSyncGroupDeviceIdentity({
      device_anchor: device.device_anchor,
      group_id: device.group_id,
      library_path: device.canonical_library_path,
      path_flavor: device.canonical_library_path.includes('\\') ? 'windows' : 'posix'
    });
    if (identity.identity_key !== device.device_identity_key || identities.has(identity.identity_key)) {
      throw new Error('sync_group_device_identity_invalid');
    }
    if ((device.state === 'left') !== Boolean(device.left_at)) throw new Error('sync_group_device_state_invalid');
    identities.add(identity.identity_key);
  }
}

async function mergeDevice(port: DbPort, device: DeviceRow) {
  await port.run(
    `INSERT INTO main.sync_group_devices (
      group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
      platform, state, joined_at, left_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
      device_name = excluded.device_name, platform = excluded.platform,
      state = excluded.state, left_at = excluded.left_at,
      last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at
    WHERE excluded.updated_at > updated_at`,
    [device.group_id, device.device_identity_key, device.device_anchor,
      device.canonical_library_path, device.device_name, device.platform, device.state,
      device.joined_at, device.left_at, device.last_seen_at, device.updated_at]
  );
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
