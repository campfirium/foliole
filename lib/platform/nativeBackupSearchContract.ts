import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeBackupSearchMatch {
  backup_name: string;
  backup_updated_at: string;
  content: string;
  deleted: boolean;
  node_id: string;
  path: string;
  title: string;
}

export type NativeBackupSearchNextResult =
  | { match: NativeBackupSearchMatch; skipped_backup_count: number; status: 'match' }
  | { skipped_backup_count: number; status: 'complete' };

export interface NativeBackupSearchCommandMap {
  [NATIVE_COMMANDS.startBackupSearch]: {
    args: { query: string };
    result: { session_id: string };
  };
  [NATIVE_COMMANDS.nextBackupSearch]: {
    args: { session_id: string };
    result: NativeBackupSearchNextResult;
  };
  [NATIVE_COMMANDS.cancelBackupSearch]: {
    args: { session_id: string };
    result: null;
  };
}
