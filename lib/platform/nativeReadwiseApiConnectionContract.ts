export type NativeReadwiseApiConnectionState =
  | 'connected'
  | 'disconnected'
  | 'reconnect_required'
  | 'secure_storage_unavailable';

export interface NativeReadwiseApiConnection {
  has_credential: boolean;
  has_source: boolean;
  state: NativeReadwiseApiConnectionState;
  verified_at: string | null;
}

export interface NativeReadwiseApiConnectionResult {
  connection: NativeReadwiseApiConnection;
  retry_after_seconds?: number;
  status:
    | NativeReadwiseApiConnectionState
    | 'connection_failed'
    | 'account_unverified'
    | 'not_active_host'
    | 'rate_limited'
    | 'source_mode_mismatch'
    | 'token_missing';
}

export type NativeReadwiseSourceIntent = 'continue' | 'replace';
export type NativeReadwiseConnectionIntent = 'migration' | 'normal';
