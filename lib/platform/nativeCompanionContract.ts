export type NativeCompanionRuntimeKind = 'android-capacitor' | 'ios-capacitor' | 'web-preview';

export const COMPANION_DATABASE_NAME = 'foliole-companion';
export const COMPANION_DATABASE_VERSION = 24;

export interface NativeCompanionBootstrapState {
  booted_at: string;
  database_path: string | null;
  database_ready: boolean;
  device_id: string;
  device_name?: string | null;
  runtime_kind: NativeCompanionRuntimeKind;
}
