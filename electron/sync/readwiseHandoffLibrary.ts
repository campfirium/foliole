import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

export const READWISE_LIBRARY_CHANGED = 'readwise_library_changed';

export function bindReadwiseHandoffLibrary() {
  const connection = openDatabaseConnection();
  const isCurrent = () => openDatabaseConnection() === connection;
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error(READWISE_LIBRARY_CHANGED);
  };
  const run: typeof runWithDatabaseConnectionOwner = execute => runWithDatabaseConnectionOwner(() => {
    assertCurrent();
    return execute();
  });
  return { assertCurrent, isCurrent, run };
}

export type ReadwiseHandoffLibrary = ReturnType<typeof bindReadwiseHandoffLibrary>;
