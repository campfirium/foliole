import type { DbPort } from '../sync/dbPort.js';
import { loadVerifiedBodyRef, verifyBodyContent, type VerifiedBodyRef } from '../sync/verifiedBody.js';

import { assertBodyManifestIdentity, BODY_MANIFEST_SQL, type BodyManifest } from './bodyContentAdoption.js';
import { chunkedBodyHolderQueries, chunkedBodyJsonHolders } from './bodyContentCollectionQueries.js';
import { bodyJsonHolderContainsBody } from './bodyHolderScalarHash.js';

async function hasHolder(db: DbPort, tables: Set<string>, ref: VerifiedBodyRef) {
  for (const { sql, params } of chunkedBodyHolderQueries(tables, ref.hash)) {
    if ((await db.query(sql, params)).length) return true;
  }
  for (const holder of chunkedBodyJsonHolders(tables)) {
    if (await bodyJsonHolderContainsBody(db, holder, ref,
      holder.readableVersionsOnly ? { readableVersionsOnly: true } : undefined)) return true;
  }
  return false;
}

/** Explicit chunked storage only. Staged bytes without an adopted manifest are not candidates. */
export async function collectBodyContentCandidates(port: DbPort, hashes: readonly string[]) {
  return port.transaction(async (tx) => {
    const tables = new Set((await tx.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => row.name));
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('text_body_collection_invalid_hash');
      const [kind] = await tx.query<{ kind: string }>('SELECT kind FROM content_blobs WHERE hash = ?', [hash]);
      if (kind?.kind !== 'text_body') continue;
      const ref = await loadVerifiedBodyRef(tx, hash);
      if (!ref) continue;
      const [manifest] = await tx.query<BodyManifest>(BODY_MANIFEST_SQL, [hash]);
      assertBodyManifestIdentity(manifest, ref);
      await verifyBodyContent(tx, ref);
      if (await hasHolder(tx, tables, ref)) continue;
      await tx.run('DELETE FROM content_bodies WHERE hash = ?', [hash]);
      await tx.run("DELETE FROM content_blobs WHERE hash = ? AND kind = 'text_body'", [hash]);
      deletedHashes.push(hash);
      deletedBytes += ref.byteLength;
    }
    return { deletedHashes, deletedBytes };
  });
}
