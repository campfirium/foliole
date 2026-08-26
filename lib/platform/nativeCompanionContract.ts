export type NativeCompanionRuntimeKind = 'android-capacitor' | 'ios-capacitor' | 'web-preview';

export const COMPANION_DATABASE_NAME = 'foliole-companion';
export const COMPANION_DATABASE_VERSION = 32;

export interface NativeCompanionBootstrapPayload {
  booted_at: string;
  database_path: string | null;
  database_ready: boolean;
  host_name: string;
  runtime_kind: NativeCompanionRuntimeKind;
}

export interface NativeCompanionBootstrapState {
  booted_at: string;
  database_path: string | null;
  database_ready: boolean;
  /** Frozen Source execution identity, separate from Sync Group Device identity. */
  device_id: string;
  device_name?: string | null;
  host_name?: string;
  runtime_kind: NativeCompanionRuntimeKind;
}
