import { sha256 } from '@noble/hashes/sha2.js';

import type { DbPort, DbRow } from '../sync/dbPort.js';
import { canonicalManifestBytes } from '../sync/framedSyncCanonicalManifest.js';
import { recoverLegacyPublicationInventory } from '../sync/framedSyncLegacyPublicationInventory.js';
import { encodePublicationInventory } from '../sync/framedSyncPublicationInventory.js';
import { FRAMED_SYNC_READY_BLOB_FRAMES, FRAMED_SYNC_READY_COPY_RETIREMENT } from '../sync/framedSyncReadyPayloadCleanup.js';

import { framedSyncBytes, readFramedSyncPublication, sameFramedSyncBytes } from './framedSyncStagingSerialization.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

function publicationPayload(row: DbRow) {
  const input = readFramedSyncPublication(row);
  const old = framedSyncBytes(row, 'canonical_manifest');
  if (old.length && !sameFramedSyncBytes(old, canonicalManifestBytes(input.manifest))) {
    throw new Error('framed_sync_migration_unique_input_mismatch');
  }
  return encodePublicationInventory(input.manifest,
    input.inventoryDifference ?? recoverLegacyPublicationInventory(input.manifest));
}

const publications = "SELECT * FROM framed_sync_outbound_publications WHERE state = 'published'";
const frames = 'SELECT rowid AS frame_row, ciphertext FROM framed_sync_inbound_frames';
const savePublication = 'UPDATE framed_sync_outbound_publications SET canonical_manifest = ?, manifest_json = ? WHERE transfer_id = ?';
const saveFrame = 'UPDATE framed_sync_inbound_frames SET ciphertext = ? WHERE rowid = ?';

// The existing ciphertext field becomes a digest; authenticated plaintext owns recovery.
export function migrateDesktopFramedSyncPayloads(sqlite: DatabaseMigrationTarget) {
  for (const value of sqlite.prepare(publications).all()) {
    const row = value as DbRow;
    sqlite.prepare(savePublication).run(new Uint8Array(), publicationPayload(row), row.transfer_id);
  }
  for (const value of sqlite.prepare(frames).all()) {
    const row = value as DbRow;
    sqlite.prepare(saveFrame).run(sha256(framedSyncBytes(row, 'ciphertext')), row.frame_row);
  }
  for (const statement of FRAMED_SYNC_READY_COPY_RETIREMENT) sqlite.exec(statement);
  for (const value of sqlite.prepare(FRAMED_SYNC_READY_BLOB_FRAMES).all()) {
    const row = value as DbRow;
    sqlite.prepare('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ? WHERE rowid = ?')
      .run(sha256(framedSyncBytes(row, 'authenticated_plaintext')), row.frame_row);
  }
}

export async function migrateCompanionFramedSyncPayloads(db: DbPort) {
  for (const row of await db.query<DbRow>(publications)) {
    await db.run(savePublication, [new Uint8Array(), publicationPayload(row), framedSyncBytes(row, 'transfer_id')]);
  }
  for (const row of await db.query<DbRow>(frames)) {
    if (typeof row.frame_row !== 'number') throw new Error('framed_sync_migration_frame_invalid');
    await db.run(saveFrame, [sha256(framedSyncBytes(row, 'ciphertext')), row.frame_row]);
  }
  for (const statement of FRAMED_SYNC_READY_COPY_RETIREMENT) await db.run(statement);
  for (const row of await db.query<DbRow>(FRAMED_SYNC_READY_BLOB_FRAMES)) {
    if (typeof row.frame_row !== 'number') throw new Error('framed_sync_migration_frame_invalid');
    await db.run('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ? WHERE rowid = ?',
      [sha256(framedSyncBytes(row, 'authenticated_plaintext')), row.frame_row]);
  }
}
