import type { DbPort, DbRow } from '../sync/dbPort.js';
import { loadVerifiedBodyRef, readBodyText } from '../sync/verifiedBody.js';

import { androidReadableArticleSql } from './androidCompanionDerivedReadSql.js';

export interface CompanionNodeDocumentRow extends DbRow {
  id: string;
  title: string;
  body_blob_hash: string | null;
  content: string;
  content_status: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  pdf_attachment_id: string | null;
  reveal: string | null;
  current_version_id: string | null;
  deleted_at: string | null;
  parent_id: string | null;
}

/** Reading one opened article may materialize its body; ordinary sync never calls this reader. */
export function loadCompanionNodeDocument(db: DbPort, nodeId: string,
  storage: 'continuous' | 'chunked' = 'continuous'): Promise<CompanionNodeDocumentRow | null> {
  return storage === 'chunked' ? db.transaction((tx) => readDocument(tx, nodeId, storage))
    : readDocument(db, nodeId, storage);
}

async function readDocument(db: DbPort, nodeId: string,
  storage: 'continuous' | 'chunked' = 'continuous'): Promise<CompanionNodeDocumentRow | null> {
  let body: string | null = null;
  if (storage === 'chunked') {
    const [node] = await db.query<{ body_blob_hash: string | null }>(
      'SELECT body_blob_hash FROM nodes WHERE id = ?', [nodeId]);
    if (!node) return null;
    const ref = node.body_blob_hash ? await loadVerifiedBodyRef(db, node.body_blob_hash) : null;
    if (ref) body = await readBodyText(db, ref);
  }
  const sql = androidReadableArticleSql('WHERE n.id = ? LIMIT 1', storage === 'chunked'
    ? { dataExpression: 'selected_body.content', contentExpression: 'selected_body.content',
      join: 'CROSS JOIN selected_body ' } : undefined);
  const prefix = storage === 'chunked' ? 'WITH selected_body AS (SELECT CAST(? AS TEXT) AS content) ' : '';
  const [document] = await db.query<CompanionNodeDocumentRow>(`${prefix}
    SELECT article.*, n.current_version_id, n.deleted_at, n.parent_id
    FROM (${sql}) article JOIN nodes n ON n.id = article.id`,
  storage === 'chunked' ? [body, nodeId] : [nodeId]);
  return document ?? null;
}
