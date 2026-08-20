import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

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

export function diagnoseAndroidSyncTopology(input) {
  const pairing = input.pairingState || {};
  const sync = input.syncState || {};
  const windows = input.windowsClient || {};
  const endpoint = trimText(sync.endpoint_url);
  const remotePeerId = trimText(pairing.remote_peer_id);
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

function unescapeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parseAndroidSharedPreferences(xml) {
  const values = {};
  const pattern = /<string\s+name="([^"]+)">([\s\S]*?)<\/string>|<int\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/gu;
  for (const match of String(xml || '').matchAll(pattern)) {
    const key = match[1] || match[3];
    const value = match[2] ?? match[4];
    values[unescapeXml(key)] = unescapeXml(value);
  }
  return values;
}

function balancedJsonArray(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      escaped = char === '\\' && !escaped;
      if (char === '"' && !escaped) inString = false;
      if (char !== '\\') escaped = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

export function extractSyncStateFromSqliteBytes(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const endpointMatch = /workspace_sync_endpoint_url[\s\S]{0,320}?(https?:\/\/[^\s"'<>]+\b)/u.exec(text);
  const eventKeyIndex = text.indexOf('workspace_sync_events');
  const arrayStart = eventKeyIndex >= 0 ? text.indexOf('[', eventKeyIndex) : -1;
  const eventsJson = arrayStart >= 0 ? balancedJsonArray(text, arrayStart) : null;
  let syncEvents = [];
  try {
    const parsed = eventsJson ? JSON.parse(eventsJson) : [];
    syncEvents = Array.isArray(parsed) ? parsed : [];
  } catch {
    syncEvents = [];
  }
  return {
    endpoint_url: trimText(endpointMatch?.[1]),
    extraction_mode: 'sqlite-text-scan',
    sync_events: syncEvents
  };
}
