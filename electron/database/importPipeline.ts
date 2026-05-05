import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver
} from '../../lib/core/database/index.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';

import { openDatabaseConnection } from './connection.js';

export type { PersistedImportRecord, PreparedImportRecord };

export function runPreparedImport(input: PreparedImportRecord) {
  return runPreparedImportViaDriver(openDatabaseConnection().driver, input);
}

export function recordPreparedImportFailure(input: PreparedImportRecord, failureReason: string) {
  return recordPreparedImportFailureViaDriver(openDatabaseConnection().driver, input, failureReason);
}
