import { z } from 'zod';

import { ReadIntentJournal } from '../../../../../lib/core/flow/readIntentJournal';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';
import { createCompanionUuid } from '../../companionUuid';

import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';
import { createOwnedCompanionConnection } from './companionOwnedConnection';

const identityKey = 'read_intent_library_id';

export async function openCompanionReadIntentStorage(args: {
  db: DbPort; manager: CapacitorCompanionDatabaseManager; platform: 'android' | 'ios';
}) {
  await args.db.run(`INSERT INTO companion_meta(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO NOTHING`, [identityKey, createCompanionUuid(), new Date().toISOString()]);
  const [identity] = await args.db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key=?', [identityKey]);
  const libraryId = z.string().uuid().parse(identity!.value);
  const name = `foliole-read-intents-${libraryId}`;
  const connection = (await args.manager.isConnection(name, false)).result
    ? await args.manager.retrieveConnection(name, false)
    : await createOwnedCompanionConnection(args.manager, false, name, 1);
  try {
    if (!(await connection.isDBOpen()).result) await connection.open();
    const db = createCapacitorSqliteDbPort(connection, args.platform);
    // A completed admission survives process loss before the main learning transaction commits.
    await db.run('PRAGMA synchronous = FULL');
    const journal = new ReadIntentJournal(db, libraryId);
    await journal.initialize();
    return { journal, close: () => args.manager.closeConnection(name, false) };
  } catch (error) {
    await args.manager.closeConnection(name, false);
    throw error;
  }
}
