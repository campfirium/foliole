import {
  collectNodeBacklinkRecords,
  NODE_BACKLINK_TARGET_SQL,
  nodeBacklinkSourcesQuery,
  type NodeBacklinkRecord
} from '../../../../../lib/core/database/nodeBacklinks';
import type { DbRow } from '../../../../../lib/core/sync/dbPort';
import type { BacklinkItem } from '../../../../features/nodes/model/internalLinks';
import { readIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';

interface TargetRow extends DbRow { id: string; title: string | null }
interface SourceRow extends DbRow { id: string; title: string | null; content: string | null }

function toBacklinkItem(record: NodeBacklinkRecord): BacklinkItem {
  return {
    sourceNodeId: record.source_node_id,
    sourceTitle: record.source_title,
    context: record.context,
    matchCount: record.match_count
  };
}

/** Same backlink rules as the desktop runtime, read from the companion database. */
export function loadCompanionNodeBacklinks(nodeId: string): Promise<BacklinkItem[]> {
  return readIosCompanionDatabase(async (db) => {
    const [target] = await db.query<TargetRow>(NODE_BACKLINK_TARGET_SQL, [nodeId]);
    const title = target ? String(target.title ?? '') : '';
    if (!target || !title.trim()) return [];
    const query = nodeBacklinkSourcesQuery(nodeId, title);
    const sources = (await db.query<SourceRow>(query.sql, query.params)).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      content: String(row.content ?? '')
    }));
    return collectNodeBacklinkRecords({ title }, sources).map(toBacklinkItem);
  });
}
