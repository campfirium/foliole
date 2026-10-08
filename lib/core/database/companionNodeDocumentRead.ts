import type { DbPort, DbRow } from '../sync/dbPort.js';

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
export async function loadCompanionNodeDocument(db: DbPort, nodeId: string): Promise<CompanionNodeDocumentRow | null> {
  const sql = androidReadableArticleSql('WHERE n.id = ? LIMIT 1');
  const [document] = await db.query<CompanionNodeDocumentRow>(`
    SELECT article.*, n.current_version_id, n.deleted_at, n.parent_id
    FROM (${sql}) article JOIN nodes n ON n.id = article.id`,
  [nodeId]);
  return document ?? null;
}
