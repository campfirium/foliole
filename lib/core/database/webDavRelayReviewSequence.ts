import type { DbPort } from '../sync/dbPort.js';

// Share the body sequence so the LAN baseline and frozen outbox cover both kinds of changes.
export const WEB_DAV_RELAY_REVIEW_SEQUENCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS webdav_relay_review_sequence (
    state_seq INTEGER PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE
  )`,
  `INSERT INTO webdav_relay_review_sequence (state_seq, op_id)
    SELECT high_water + ROW_NUMBER() OVER (ORDER BY review.op_id), review.op_id
    FROM review_log review CROSS JOIN sync_state_sequence seq
    WHERE seq.singleton_id = 1 AND NOT EXISTS (
      SELECT 1 FROM webdav_relay_review_sequence tracked WHERE tracked.op_id = review.op_id
    )`,
  `UPDATE sync_state_sequence
    SET high_water = MAX(high_water, COALESCE((SELECT MAX(state_seq) FROM webdav_relay_review_sequence), 0))
    WHERE singleton_id = 1`,
  `CREATE TRIGGER IF NOT EXISTS trg_webdav_relay_review_insert AFTER INSERT ON review_log BEGIN
    UPDATE sync_state_sequence SET high_water = high_water + 1 WHERE singleton_id = 1;
    INSERT INTO webdav_relay_review_sequence (state_seq, op_id)
      SELECT high_water, NEW.op_id FROM sync_state_sequence WHERE singleton_id = 1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_webdav_relay_review_delete AFTER DELETE ON review_log BEGIN
    DELETE FROM webdav_relay_review_sequence WHERE op_id = OLD.op_id;
  END`
] as const;

export async function installRelayReviewSequence(db: DbPort) {
  for (const sql of WEB_DAV_RELAY_REVIEW_SEQUENCE_SCHEMA) await db.run(sql);
}
