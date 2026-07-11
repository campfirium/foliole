import type { NativeCompanionPairingState } from '../../../lib/platform/nativeCompanionSyncContract';
import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolDescriptor
} from '../../../lib/platform/syncProtocolContract';

const WEB_PAIRING_STATE_KEY = 'foliole-companion-pairing-state';

export type WebCompanionPairingState = NativeCompanionPairingState & { device_secret?: string };

export function normalizePairingState(value: unknown): NativeCompanionPairingState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const protocolCompatibility = evaluateSyncProtocolCompatibility(null);
    return {
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null,
      primary_device_id: null,
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
    device_id: typeof raw.device_id === 'string' && raw.device_id.trim() ? raw.device_id.trim() : null,
    device_kind: typeof raw.device_kind === 'string' && raw.device_kind.trim() ? raw.device_kind.trim() : null,
    device_name: typeof raw.device_name === 'string' && raw.device_name.trim() ? raw.device_name.trim() : null,
    is_paired: isPaired,
    negotiated_protocol_version: negotiatedVersion,
    paired_at: typeof raw.paired_at === 'string' && raw.paired_at.trim() ? raw.paired_at.trim() : null,
    primary_device_id: typeof raw.primary_device_id === 'string' && raw.primary_device_id.trim() ? raw.primary_device_id.trim() : null,
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
