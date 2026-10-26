/// <reference types="vite/client" />
import { sqlRecording } from '../../../../lib/core/diagnostics/sqlRecording.js';

/** Explicit development opt-in; no recording starts merely by opening a database. */
export function exposeCompanionSqlRecording() {
  if (import.meta.env?.DEV && import.meta.env.VITE_FOLIOLE_SQL_RECORDING === '1') {
    Object.assign(globalThis, { __folioleSqlRecording: sqlRecording });
  }
}
