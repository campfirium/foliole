export interface SqlRecordingOptions {
  durationMs?: number;
  windowMs?: number;
  maxGroups?: number;
  label?: string;
}

export interface SqlRecordingGroup {
  sql: string;
  method: string;
  host: string;
  label: string;
  caller: string;
  count: number;
  errors: number;
  returnedRows: number;
  totalMs: number;
  maxMs: number;
}

export interface SqlRecordingReport {
  version: 1;
  startedAt: string;
  durationMs: number;
  running: boolean;
  pending: number;
  overflowOperations: number;
  groups: SqlRecordingGroup[];
  windows: { offsetMs: number; count: number; totalMs: number; maxMs: number }[];
  marks: { offsetMs: number; label: string }[];
  limits: { durationMs: number; windowMs: number; maxGroups: number };
}

export type FinishSqlRecording = (elapsedMs: number, returnedRows: number, failed: boolean) => void;
