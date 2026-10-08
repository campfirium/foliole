import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { verifyTextBodyCandidate, verifyTextBodyCandidateWithPort } from './textBodyBlobCandidate.js';
import {
  bodyHolderQueries, DELETE_BODY_DATA_SQL, DELETE_BODY_METADATA_SQL
} from './textBodyBlobCollectionQueries.js';

const TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table'";

/** Only selected candidates are considered; malformed holder facts abort the transaction. */
export function collectTextBodyBlobCandidates(driver: DatabaseDriver, hashes: readonly string[]) {
  return driver.transaction(() => {
    const tables = new Set(driver.queryAll<{ name: string }>(TABLES_SQL).map((row) => row.name));
    if (!tables.has('content_blob_data')) return { deletedHashes: [], deletedBytes: 0 };
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      if (bodyHolderQueries(tables, hash).some(({ sql, params }) => driver.queryOne(sql, params))) continue;
      const body = verifyTextBodyCandidate(driver, hash);
      if (!body) continue;
      driver.execute(DELETE_BODY_DATA_SQL, [hash]);
      driver.execute(DELETE_BODY_METADATA_SQL, [hash]);
      deletedHashes.push(hash);
      deletedBytes += body.bytes;
    }
    return { deletedHashes, deletedBytes };
  });
}

/** Same holder and byte contract through the shared asynchronous sync port. */
export async function collectTextBodyBlobCandidatesWithPort(port: DbPort, hashes: readonly string[]) {
  return port.transaction(async (tx) => {
    const tables = new Set((await tx.query<{ name: string }>(TABLES_SQL)).map((row) => row.name));
    if (!tables.has('content_blob_data')) return { deletedHashes: [], deletedBytes: 0 };
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      if (await hasBodyHolder(tx, tables, hash)) continue;
      const body = await verifyTextBodyCandidateWithPort(tx, hash);
      if (!body) continue;
      await tx.run(DELETE_BODY_DATA_SQL, [hash]);
      await tx.run(DELETE_BODY_METADATA_SQL, [hash]);
      deletedHashes.push(hash);
      deletedBytes += body.bytes;
    }
    return { deletedHashes, deletedBytes };
  });
}

async function hasBodyHolder(tx: DbPort, tables: Set<string>, hash: string) {
  for (const { sql, params } of bodyHolderQueries(tables, hash)) {
    if ((await tx.query(sql, params)).length) return true;
  }
  return false;
}
