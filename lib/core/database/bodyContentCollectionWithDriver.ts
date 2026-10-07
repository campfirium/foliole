import type { VerifiedBodyRef } from '../sync/verifiedBody.js';

import { assertBodyManifestIdentity, BODY_MANIFEST_SQL, type BodyManifest } from './bodyContentAdoption.js';
import { chunkedBodyHolderQueries, chunkedBodyJsonHolders } from './bodyContentCollectionQueries.js';
import { bodyJsonHolderContainsBodyWithDriver } from './bodyHolderScalarHashWithDriver.js';
import type { DatabaseDriver } from './driver.js';
import { loadVerifiedBodyRefWithDriver, verifyBodyContentWithDriver } from './verifiedBodyWithDriver.js';

function hasHolder(driver: DatabaseDriver, tables: Set<string>, ref: VerifiedBodyRef) {
  for (const { sql, params } of chunkedBodyHolderQueries(tables, ref.hash)) {
    if (driver.queryOne(sql, params)) return true;
  }
  for (const holder of chunkedBodyJsonHolders(tables)) {
    if (bodyJsonHolderContainsBodyWithDriver(driver, holder, ref,
      holder.readableVersionsOnly ? { readableVersionsOnly: true } : undefined)) return true;
  }
  return false;
}

/** DatabaseDriver adapter for explicit chunked storage; policies come from shared holder queries. */
export function collectBodyContentCandidatesWithDriver(driver: DatabaseDriver, hashes: readonly string[]) {
  return driver.transaction((tx) => {
    const tables = new Set(tx.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('text_body_collection_invalid_hash');
      const kind = tx.queryOne<{ kind: string }>('SELECT kind FROM content_blobs WHERE hash = ?', [hash]);
      if (kind?.kind !== 'text_body') continue;
      const ref = loadVerifiedBodyRefWithDriver(tx, hash);
      if (!ref) continue;
      assertBodyManifestIdentity(tx.queryOne<BodyManifest>(BODY_MANIFEST_SQL, [hash]), ref);
      verifyBodyContentWithDriver(tx, ref);
      if (hasHolder(tx, tables, ref)) continue;
      tx.execute('DELETE FROM content_bodies WHERE hash = ?', [hash]);
      tx.execute("DELETE FROM content_blobs WHERE hash = ? AND kind = 'text_body'", [hash]);
      deletedHashes.push(hash);
      deletedBytes += ref.byteLength;
    }
    return { deletedHashes, deletedBytes };
  });
}
