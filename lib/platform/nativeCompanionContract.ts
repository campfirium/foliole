export type NativeCompanionRuntimeKind = 'android-capacitor' | 'web-preview';

export interface NativeCompanionBootstrapState {
  booted_at: string;
  database_path: string | null;
  database_ready: boolean;
  device_id: string;
  runtime_kind: NativeCompanionRuntimeKind;
}
