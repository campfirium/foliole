import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeReadwiseHostAssignment,
  NativeReadwiseWorkgroupHost
} from '../../lib/platform/nativeReadwiseHostContract.js';
import { isDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';
import { isStoredReadwiseApiConnectionReady } from '../import/readwiseApiConnectionState.js';
import { isReadwiseExecutionStopping } from '../import/readwiseExecutionBarrier.js';
import { loadReadwiseHandoffIntent } from '../sync/readwiseHandoffIntent.js';

import { openDatabaseConnection } from './connection.js';
import { isDesktopSourceExecutable, loadCurrentHostDesktopSources } from './desktopSources.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { loadReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { loadReadwiseSourceModeState } from './readwiseSourceMode.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const READWISE_ACTIVE_HOST_KEY = 'readwise_active_host';

function readActiveHost() {
  const value = loadJsonSetting(READWISE_ACTIVE_HOST_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { deviceId: null, hostName: null, epoch: 0 };
  const record = value as Record<string, unknown>;
  const hostName = typeof record.host_name === 'string' && record.host_name.trim()
    ? record.host_name.trim() : null;
  const deviceId = typeof record.device_identity_key === 'string' && record.device_identity_key.trim()
    ? record.device_identity_key.trim() : null;
  const epoch = record.epoch === undefined ? 0
    : Number.isSafeInteger(record.epoch) && Number(record.epoch) >= 0 ? Number(record.epoch) : -1;
  return { deviceId, hostName, epoch };
}

function hostDetails(hostName: string): NativeReadwiseWorkgroupHost {
  return openDatabaseConnection().driver.queryOne<NativeReadwiseWorkgroupHost & DatabaseRow>(
    `SELECT device_name AS host_name, platform
     FROM sync_group_devices WHERE device_name = ? ORDER BY updated_at DESC LIMIT 1`, [hostName]
  ) ?? { host_name: hostName, platform: null };
}

function currentHostName() {
  return openDatabaseConnection().driver.queryOne<{ host_name: string }>(
    `SELECT d.device_name AS host_name FROM sync_group_local_state l
     JOIN sync_group_devices d
       ON d.group_id = l.group_id AND d.device_identity_key = l.local_device_identity_key
     WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active' LIMIT 1`
  )?.host_name ?? loadOrCreateDesktopHostName();
}

function activeGroupMembers() {
  const driver = openDatabaseConnection().driver;
  const local = driver.queryOne<{ device_identity_key: string; group_id: string }>(
    `SELECT local_device_identity_key AS device_identity_key, group_id FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active' LIMIT 1`
  );
  if (!local) return { groupId: null, localId: null,
    members: [] as Array<{ device_identity_key: string; device_name: string; platform: string }> };
  const members = driver.queryAll<{ device_identity_key: string; device_name: string; platform: string }>(
    `SELECT device_identity_key, device_name, platform FROM sync_group_devices
     WHERE group_id = ? AND state = 'active'`, [local.group_id]
  ).filter((member) => isDesktopSyncGroupPlatform(member.platform));
  return { groupId: local.group_id, localId: local.device_identity_key, members };
}

function guardAllowsOwner(groupId: string | null, ownerId: string | null, epoch: number) {
  if (!groupId || !ownerId) return true;
  if (epoch < 0) return false;
  try {
    const guard = loadReadwiseOwnerGuard(groupId);
    if (!guard) return epoch === 0;
    return guard.state === 'active' && guard.ownerId === ownerId &&
      guard.epoch === epoch;
  } catch { return false; }
}

function hasLocalGuardHistory(groupId: string | null) {
  if (!groupId) return false;
  try { return loadReadwiseOwnerGuard(groupId) !== null; }
  catch { return true; }
}

function canRetryOwnBootstrap(groupId: string | null, localId: string | null, epoch: number) {
  if (!groupId || !localId) return false;
  try {
    const guard = loadReadwiseOwnerGuard(groupId);
    return guard?.state === 'relinquished' && guard.ownerId === localId &&
      guard.targetId === localId && guard.epoch === epoch;
  } catch { return false; }
}

function readWorkgroupDesktopHosts(currentHostName: string, activeHostName: string | null) {
  const hosts = openDatabaseConnection().driver.queryAll<NativeReadwiseWorkgroupHost & DatabaseRow>(
    `SELECT d.device_name AS host_name, d.platform
     FROM sync_group_local_state l
     JOIN sync_group_devices d ON d.group_id = l.group_id
     WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active'
     ORDER BY d.device_name`
  ).filter((host) => host.platform && isDesktopSyncGroupPlatform(host.platform));
  const byName = new Map<string, NativeReadwiseWorkgroupHost>(
    hosts.map((host) => [host.host_name, host])
  );
  for (const hostName of [currentHostName, activeHostName]) {
    if (hostName && !byName.has(hostName)) {
      byName.set(hostName, hostDetails(hostName));
    }
  }
  return [...byName.values()];
}

export function loadReadwiseHostAssignment(): NativeReadwiseHostAssignment {
  const group = activeGroupMembers();
  const currentHost = currentHostName();
  const owner = readActiveHost();
  const byId = group.members.find((member) => member.device_identity_key === owner.deviceId);
  const byName = group.members.filter((member) => member.device_name === owner.hostName);
  const activeId = owner.deviceId ?? (byName.length === 1 ? byName[0]?.device_identity_key ?? null : null);
  const activeHost = byId?.device_name ?? owner.hostName;
  const unassigned = !owner.deviceId && !owner.hostName;
  const localQualified = group.members.some((member) => member.device_identity_key === group.localId);
  const ownerMatches = localQualified && activeId === group.localId && !unassigned;
  const guardReady = guardAllowsOwner(group.groupId, activeId, owner.epoch);
  let relinquished = false;
  if (ownerMatches && group.groupId) {
    try { relinquished = loadReadwiseOwnerGuard(group.groupId)?.state === 'relinquished'; }
    catch { /* invalid guard stays unavailable */ }
  }
  const stopping = isReadwiseExecutionStopping(group.groupId);
  const isActive = group.localId
    ? ownerMatches && guardReady && !stopping
    : unassigned || owner.hostName === currentHost;
  const blockedReason = isActive || !group.localId ? null
    : ownerMatches && (relinquished || stopping) ? 'handoff-in-progress'
      : ownerMatches && !guardReady ? 'guard-unavailable'
      : unassigned && hasLocalGuardHistory(group.groupId) &&
          !canRetryOwnBootstrap(group.groupId, group.localId, owner.epoch) ? 'guard-history'
      : !canPrepareReadwiseOnThisHost() ? 'connection-unavailable'
      : !unassigned ? 'handoff-required'
      : group.members.length !== 1 || group.members[0]?.device_identity_key !== group.localId
        ? 'group-quiescence-required' : null;
  const intent = group.groupId ? loadReadwiseHandoffIntent(group.groupId) : null;
  return {
    active_host_name: activeHost,
    active_device_identity_key: activeId,
    active_owner_epoch: owner.epoch,
    current_host_name: currentHost,
    current_device_identity_key: group.localId,
    hosts: readWorkgroupDesktopHosts(currentHost, activeHost),
    is_active: isActive,
    handoff_pending: !isActive && intent?.targetId === group.localId &&
      intent.ownerId === activeId && intent.epoch === owner.epoch,
    legacy_unassigned: unassigned,
    activation_blocked_reason: blockedReason
  };
}

export function activateReadwiseOnThisHost() {
  const assignment = loadReadwiseHostAssignment();
  if (assignment.is_active) return assignment;
  if (assignment.activation_blocked_reason) throw new Error(`readwise_${assignment.activation_blocked_reason}`);
  if (!assignment.current_device_identity_key) throw new Error('readwise_current_device_unavailable');
  const group = activeGroupMembers();
  if (!group.groupId) throw new Error('readwise_group_unavailable');
  if (loadReadwiseOwnerGuard(group.groupId)) throw new Error('readwise_guard_history_requires_handoff');
  const mode = loadReadwiseSourceModeState().mode;
  if (mode === 'off') throw new Error('readwise_source_mode_off');
  saveReadwiseOwnerGuard({ epoch: 1, groupId: group.groupId, mode,
    ownerId: assignment.current_device_identity_key, state: 'active', targetId: null });
  saveJsonSetting(READWISE_ACTIVE_HOST_KEY, {
    device_identity_key: assignment.current_device_identity_key,
    epoch: 1,
    host_name: assignment.current_host_name
  });
  return loadReadwiseHostAssignment();
}

export function canPrepareReadwiseOnThisHost() {
  const sourceMode = loadReadwiseSourceModeState();
  if (sourceMode.conflictReasons.length || sourceMode.mode === 'off') return false;
  if (loadReadwiseSourceCutover()?.status === 'migration-in-progress') return false;
  if (sourceMode.mode === 'api') return isStoredReadwiseApiConnectionReady();
  return loadCurrentHostDesktopSources('readwise').some(isDesktopSourceExecutable);
}

export function canCurrentHostRunReadwise(
  mode: 'api' | 'relay' = loadReadwiseSourceModeState().mode === 'api' ? 'api' : 'relay'
) {
  if (!loadReadwiseHostAssignment().is_active) return false;
  const sourceMode = loadReadwiseSourceModeState();
  if (sourceMode.mode !== mode || !canPrepareReadwiseOnThisHost()) return false;
  if (mode === 'api') return true;
  return loadCurrentHostDesktopSources('readwise').some((source) => {
    try {
      return (JSON.parse(source.type_settings_json) as Record<string, unknown>).keepState === 'enabled'
        && isDesktopSourceExecutable(source);
    } catch { return false; }
  });
}
