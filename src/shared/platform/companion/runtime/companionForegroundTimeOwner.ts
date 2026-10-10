import { z } from 'zod';

import { FOREGROUND_OWNER_SCHEMA, FOREGROUND_UUID_SQL } from '../../../../../lib/core/database/foregroundTimeSource';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';

const name = 'foliole-foreground-time-owners';

export async function loadCompanionForegroundOwner(args: {
  manager: CapacitorCompanionDatabaseManager; libraryPath: string; platform: 'android' | 'ios';
}) {
  const connection = (await args.manager.isConnection(name, false)).result
    ? await args.manager.retrieveConnection(name, false)
    : await args.manager.createConnection(name, false, 'no-encryption', 1, false);
  try {
    if (!(await connection.isDBOpen()).result) await connection.open();
    const db = createCapacitorSqliteDbPort(connection, args.platform);
    await db.run(FOREGROUND_OWNER_SCHEMA);
    await db.run(`INSERT INTO foreground_time_owners(library_path, owner_id) VALUES (?, ${FOREGROUND_UUID_SQL})
      ON CONFLICT(library_path) DO NOTHING`, [args.libraryPath]);
    const [row] = await db.query('SELECT owner_id FROM foreground_time_owners WHERE library_path = ?', [args.libraryPath]);
    return z.object({ owner_id: z.string().uuid() }).parse(row).owner_id;
  } finally { await args.manager.closeConnection(name, false); }
}
