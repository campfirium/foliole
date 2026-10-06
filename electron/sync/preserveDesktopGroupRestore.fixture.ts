import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { preserveDesktopIdentityRestore } from './preserveDesktopGroupRestore.js';

export async function preserveWithConcurrentTransaction(groupId: string) {
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const held = createBetterSqliteDbPort(openDatabaseConnection().sqlite).transaction(async () => { started(); await wait; });
  await entered;
  const preservation = preserveDesktopIdentityRestore(groupId, 'unapplied')
    .then(() => null, (error: Error) => error.message);
  await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  await held;
  const error = await preservation;
  if (error) throw new Error(error);
  return true;
}
