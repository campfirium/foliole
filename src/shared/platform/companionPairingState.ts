import type { NativeCompanionPairingState } from '../../../lib/platform/nativeCompanionSyncContract';
import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolDescriptor
} from '../../../lib/platform/syncProtocolContract';

const WEB_PAIRING_STATE_KEY = 'foliole-companion-pairing-state';

export type WebCompanionPairingState = NativeCompanionPairingState & {
  credential_secret?: string;
  device_secret?: string;
};

export function normalizePairingState(value: unknown): NativeCompanionPairingState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const protocolCompatibility = evaluateSyncProtocolCompatibility(null);
    return {
      authorization_id: null,
      device_id: null,
      device_kind: null,
      device_name: null,
      host_name: null,
      host_platform: null,
      is_paired: false,
      paired_at: null,
      primary_device_id: null,
      remote_peer_id: null,
      remote_peer_name: null,
      remote_peer_platform: null,
      protocol_compatibility: protocolCompatibility,
      remote_protocol: null,
      repair_required: false,
      sync_usable: false
    };
  }
  const raw = value as Record<string, unknown>;
  const remoteProtocol = parseSyncProtocolDescriptor(raw.remote_protocol);
  const protocolCompatibility = evaluateSyncProtocolCompatibility(remoteProtocol);
  const isPaired = raw.is_paired === true;
  const negotiatedVersion = typeof raw.negotiated_protocol_version === 'number'
    ? raw.negotiated_protocol_version
    : null;
  const syncUsable = isPaired && protocolCompatibility.status === 'compatible' &&
    negotiatedVersion === CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version;
  return {
    authorization_id: typeof raw.authorization_id === 'string' && raw.authorization_id.trim()
      ? raw.authorization_id.trim() : null,
    device_id: typeof raw.device_id === 'string' && raw.device_id.trim() ? raw.device_id.trim() : null,
    device_kind: typeof raw.device_kind === 'string' && raw.device_kind.trim() ? raw.device_kind.trim() : null,
    device_name: typeof raw.device_name === 'string' && raw.device_name.trim() ? raw.device_name.trim() : null,
    host_name: typeof raw.host_name === 'string' && raw.host_name.trim() ? raw.host_name.trim() : null,
    host_platform: typeof raw.host_platform === 'string' && raw.host_platform.trim() ? raw.host_platform.trim() : null,
    is_paired: isPaired,
    negotiated_protocol_version: negotiatedVersion,
    paired_at: typeof raw.paired_at === 'string' && raw.paired_at.trim() ? raw.paired_at.trim() : null,
    primary_device_id: typeof raw.primary_device_id === 'string' && raw.primary_device_id.trim() ? raw.primary_device_id.trim() : null,
    remote_peer_id: typeof raw.remote_peer_id === 'string' && raw.remote_peer_id.trim() ? raw.remote_peer_id.trim() : null,
    remote_peer_name: typeof raw.remote_peer_name === 'string' && raw.remote_peer_name.trim() ? raw.remote_peer_name.trim() : null,
    remote_peer_platform: typeof raw.remote_peer_platform === 'string' && raw.remote_peer_platform.trim() ? raw.remote_peer_platform.trim() : null,
    protocol_compatibility: protocolCompatibility,
    remote_protocol: remoteProtocol,
    repair_required: isPaired && !syncUsable,
    sync_usable: syncUsable
  };
}

export function isCompanionPairingSyncUsable(state: NativeCompanionPairingState) {
  return normalizePairingState(state).sync_usable === true;
}

export function readStoredWebPairingState() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return JSON.parse(window.localStorage.getItem(WEB_PAIRING_STATE_KEY) ?? 'null') as WebCompanionPairingState | null;
  } catch {
    return null;
  }
}

export function readWebPairingState() {
  return normalizePairingState(readStoredWebPairingState());
}

export function clearWebPairingState() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(WEB_PAIRING_STATE_KEY);
  }
  return normalizePairingState(null);
}

export function writeWebPairingState(state: WebCompanionPairingState) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WEB_PAIRING_STATE_KEY, JSON.stringify(state));
  }
  return normalizePairingState(state);
}
