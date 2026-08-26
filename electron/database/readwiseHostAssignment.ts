import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeReadwiseHostAssignment,
  NativeReadwiseWorkgroupHost
} from '../../lib/platform/nativeReadwiseHostContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadCurrentHostDesktopSources } from './desktopSources.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const READWISE_ACTIVE_HOST_KEY = 'readwise_active_host';

function readActiveHostName() {
  const value = loadJsonSetting(READWISE_ACTIVE_HOST_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const hostName = (value as Record<string, unknown>).host_name;
  return typeof hostName === 'string' && hostName.trim() ? hostName.trim() : null;
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

function readWorkgroupDesktopHosts(currentHostName: string, activeHostName: string | null) {
  const hosts = openDatabaseConnection().driver.queryAll<NativeReadwiseWorkgroupHost & DatabaseRow>(
    `SELECT d.device_name AS host_name, d.platform
     FROM sync_group_local_state l
     JOIN sync_group_devices d ON d.group_id = l.group_id
     WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active'
       AND d.platform IN ('darwin', 'win32')
     ORDER BY d.device_name`
  );
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
  const currentHost = currentHostName();
  const activeHost = readActiveHostName();
  return {
    active_host_name: activeHost,
    current_host_name: currentHost,
    hosts: readWorkgroupDesktopHosts(currentHost, activeHost),
    is_active: activeHost === null || activeHost === currentHost,
    legacy_unassigned: activeHost === null
  };
}

export function activateReadwiseOnThisHost() {
  const currentHost = currentHostName();
  saveJsonSetting(READWISE_ACTIVE_HOST_KEY, { host_name: currentHost });
  return loadReadwiseHostAssignment();
}

export function canCurrentHostRunReadwise() {
  if (!loadReadwiseHostAssignment().is_active) return false;
  const sources = loadCurrentHostDesktopSources('readwise').filter((source) => {
      try { return (JSON.parse(source.type_settings_json) as Record<string, unknown>).keepState === 'enabled'; }
      catch { return false; }
    });
  return sources.length > 0;
}
