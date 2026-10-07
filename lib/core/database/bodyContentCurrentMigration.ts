import { adoptVerifiedBody, stageBodyContent } from '../sync/bodyContentWrite.js';
import type { DbPort } from '../sync/dbPort.js';

import { bodyMigrationSourceChunks, bodyMigrationSourceHash } from './bodyContentMigrationSource.js';

type InlineNodeBody = { id: string; size: number; updated_at: string };

/** Current inline bodies remain original facts until their stable owner is committed. */
export async function migrateCurrentNodeBodyOwners(db: DbPort) {
  let after: string | null = null;
  for (;;) {
    const [row]: InlineNodeBody[] = await db.query<InlineNodeBody>(
      `SELECT id, length(CAST(content AS BLOB)) AS size, updated_at FROM nodes
       WHERE NULLIF(TRIM(body_blob_hash), '') IS NULL AND (? IS NULL OR id > ?)
       ORDER BY id LIMIT 1`, [after, after]);
    if (!row) break;
    const source = { kind: 'node', id: row.id } as const;
    const hash = await bodyMigrationSourceHash(db, source, row.size);
    const ref = await stageBodyContent(db, { hash, byteLength: row.size,
      chunks: bodyMigrationSourceChunks(db, source, row.size) });
    await adoptVerifiedBody(db, ref, row.updated_at);
    await db.run("UPDATE nodes SET body_blob_hash = ?, content = '' WHERE id = ?", [hash, row.id]);
    after = row.id;
  }
  // Hashed nodes use the verified body's frontmatter range, including bodies with no prefix.
  await db.run("UPDATE nodes SET content = '' WHERE content != '' AND body_blob_hash IS NOT NULL");
}
