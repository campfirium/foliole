#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import { URL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: windows-android-lab-sync-topology --pairing-state <json|path> --sync-state <json|path> --windows-client <json|path> --executor-device-id <id>');
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function readJsonValue(value) {
  const source = fs.existsSync(value) ? fs.readFileSync(value, 'utf8') : value;
  return JSON.parse(source);
}

function trimText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function endpointKind(endpointUrl) {
  const endpoint = trimText(endpointUrl);
  if (!endpoint) return 'missing';
  try {
    const parsed = new URL(endpoint);
    const host = parsed.hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '10.0.2.2' ? 'loopback' : 'lan';
  } catch {
    return 'invalid';
  }
}

function sanitizeSyncEvent(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    id: trimText(event.id),
    kind: trimText(event.kind),
    occurred_at: trimText(event.occurred_at),
    result: trimText(event.result),
    status: trimText(event.status)
  };
}

export function diagnoseWindowsAndroidLabSyncTopology(input) {
  const pairing = input.pairingState || {};
  const sync = input.syncState || {};
  const windows = input.windowsClient || {};
  const endpoint = trimText(sync.endpoint_url);
  const remotePeerId = trimText(pairing.remote_peer_id) || trimText(pairing.primary_device_id);
  const windowsPeerId = trimText(windows.peer_id) || trimText(windows.device_id);
  const kind = endpointKind(endpoint);
  const executorDeviceId = trimText(input.executorDeviceId);
  const executorEqualsSyncPeer = Boolean(executorDeviceId && remotePeerId && executorDeviceId === remotePeerId);
  const windowsEqualsSyncPeer = Boolean(windowsPeerId && remotePeerId && windowsPeerId === remotePeerId);
  const latestSyncEvent = Array.isArray(sync.sync_events) ? sanitizeSyncEvent(sync.sync_events[0]) : null;
  return {
    endpoint_kind: kind,
    endpoint_url: endpoint,
    executor_device_id: executorDeviceId,
    executor_equals_sync_peer: executorEqualsSyncPeer,
    latest_sync_event: latestSyncEvent,
    remote_peer_id: remotePeerId,
    remote_peer_name: trimText(pairing.remote_peer_name),
    remote_peer_platform: trimText(pairing.remote_peer_platform),
    reverse_policy: kind === 'loopback' && windowsEqualsSyncPeer ? 'required' : kind === 'lan' ? 'forbidden' : 'blocked',
    schema_version: 1,
    windows_client_peer_id: windowsPeerId,
    windows_equals_sync_peer: windowsEqualsSyncPeer
  };
}

if (process.argv[1]?.endsWith('windows-android-lab-sync-topology.mjs')) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = diagnoseWindowsAndroidLabSyncTopology({
      executorDeviceId: args['executor-device-id'],
      pairingState: readJsonValue(args['pairing-state']),
      syncState: readJsonValue(args['sync-state']),
      windowsClient: readJsonValue(args['windows-client'])
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[sync-topology] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
