import { loadArticleAttachmentNeeds } from '../../../../../../lib/core/sync/articleAttachmentNeeds';
import { syncCompanionContentBlobFromDesktop } from '../../../companionDesktopSyncContentBlobs';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

export async function loadCompanionArticleAttachmentNeeds(endpointUrl: string, articleIds: readonly string[]) {
  const owner = getIosCompanionDatabaseOwner();
  // The general body pass is budgeted. Finish this delivery's bodies before parsing its images.
  for (const id of new Set(articleIds)) {
    const [row] = await owner.read((db) => db.query<{ hash: string }>(
      `SELECT n.body_blob_hash AS hash FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ? AND n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL`, [id]
    ));
    if (row?.hash) {
      await syncCompanionContentBlobFromDesktop(endpointUrl, row.hash).catch(() => undefined);
    }
  }
  return owner.read((db) => loadArticleAttachmentNeeds(db, articleIds));
}
