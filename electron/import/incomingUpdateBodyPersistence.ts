import { collectBodyContentCandidatesWithDriver } from '../../lib/core/database/bodyContentCollectionWithDriver.js';
import { adoptVerifiedBodyWithDriver, stageTextBodyContentWithDriver } from '../../lib/core/database/bodyContentWriteWithDriver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from '../../lib/core/database/verifiedBodyWithDriver.js';

export type IncomingBodyStorage = 'continuous' | 'chunked';

export function incomingBodyColumns(bodyStorage: IncomingBodyStorage) {
  return bodyStorage === 'continuous' ? 'updated_content' : "'' AS updated_content, body_blob_hash";
}

export function readIncomingBody(driver: DatabaseDriver, row: { updated_content: string; body_blob_hash?: string | null },
  bodyStorage: IncomingBodyStorage) {
  if (bodyStorage === 'continuous') return row.updated_content;
  if (!row.body_blob_hash) throw new Error('body_content_unavailable');
  const ref = loadVerifiedBodyRefWithDriver(driver, row.body_blob_hash);
  if (!ref) throw new Error('body_content_unavailable');
  return readBodyTextWithDriver(driver, ref);
}

export function withIncomingBodyWrite<T>(driver: DatabaseDriver, content: string, timestamp: string,
  bodyStorage: IncomingBodyStorage, write: (tx: DatabaseDriver, content: string, hash?: string) => T) {
  if (bodyStorage === 'continuous') return write(driver, content);
  return driver.transaction((tx) => {
    const hash = adoptVerifiedBodyWithDriver(tx, stageTextBodyContentWithDriver(tx, content), timestamp);
    return write(tx, '', hash);
  });
}

export function clearIncomingChunkedBody(driver: DatabaseDriver, id: string, status: string) {
  driver.transaction((tx) => {
    const previous = tx.queryOne<{ body_blob_hash: string | null }>(
      'SELECT body_blob_hash FROM incoming_updates WHERE id = ? AND status = ?', [id, status]);
    tx.execute('DELETE FROM incoming_updates WHERE id = ? AND status = ?', [id, status]);
    if (previous?.body_blob_hash) collectBodyContentCandidatesWithDriver(tx, [previous.body_blob_hash]);
  });
}

export function collectReplacedIncomingBody(driver: DatabaseDriver, previousHash: string | null | undefined, nextHash: string | undefined) {
  if (previousHash && previousHash !== nextHash) collectBodyContentCandidatesWithDriver(driver, [previousHash]);
}
