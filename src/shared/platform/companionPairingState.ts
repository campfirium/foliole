import type { NativeCompanionPairingState } from '../../../lib/platform/nativeCompanionSyncContract';

const WEB_PAIRING_STATE_KEY = 'foliole-companion-pairing-state';

export type WebCompanionPairingState = NativeCompanionPairingState & { device_secret?: string };

export function normalizePairingState(value: unknown): NativeCompanionPairingState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    device_id: typeof raw.device_id === 'string' && raw.device_id.trim() ? raw.device_id.trim() : null,
    device_kind: typeof raw.device_kind === 'string' && raw.device_kind.trim() ? raw.device_kind.trim() : null,
    device_name: typeof raw.device_name === 'string' && raw.device_name.trim() ? raw.device_name.trim() : null,
    is_paired: raw.is_paired === true,
    paired_at: typeof raw.paired_at === 'string' && raw.paired_at.trim() ? raw.paired_at.trim() : null
  };
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

export function writeWebPairingState(state: WebCompanionPairingState) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WEB_PAIRING_STATE_KEY, JSON.stringify(state));
  }
  return normalizePairingState(state);
}
