import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import {
  BODY_CANDIDATE_SQL, bodyHolderQueries, DELETE_BODY_DATA_SQL, DELETE_BODY_METADATA_SQL, inspectBodyCandidate
} from './textBodyBlobCollectionQueries.js';

const TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table'";
type Candidate = { kind: string; data: string };

/** Only selected candidates are considered; malformed holder facts abort the transaction. */
export function collectTextBodyBlobCandidates(driver: DatabaseDriver, hashes: readonly string[]) {
  return driver.transaction(() => {
    const tables = new Set(driver.queryAll<{ name: string }>(TABLES_SQL).map((row) => row.name));
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      const body = inspectBodyCandidate(hash, driver.queryOne<Candidate>(BODY_CANDIDATE_SQL, [hash]));
      if (!body) continue;
      if (bodyHolderQueries(tables, hash, body.text).some(({ sql, params }) => driver.queryOne(sql, params))) continue;
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
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      const [row] = await tx.query<Candidate>(BODY_CANDIDATE_SQL, [hash]);
      const body = inspectBodyCandidate(hash, row);
      if (!body || await hasBodyHolder(tx, tables, hash, body.text)) continue;
      await tx.run(DELETE_BODY_DATA_SQL, [hash]);
      await tx.run(DELETE_BODY_METADATA_SQL, [hash]);
      deletedHashes.push(hash);
      deletedBytes += body.bytes;
    }
    return { deletedHashes, deletedBytes };
  });
}

async function hasBodyHolder(tx: DbPort, tables: Set<string>, hash: string, text: string) {
  for (const { sql, params } of bodyHolderQueries(tables, hash, text)) {
    if ((await tx.query(sql, params)).length) return true;
  }
  return false;
}
