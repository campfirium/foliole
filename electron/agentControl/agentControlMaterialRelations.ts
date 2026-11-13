import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadNodeBacklinks } from '../database/nodeBacklinks.js';

export function readAgentControlMaterialRelations(id: string) {
  const { driver } = openDatabaseConnection();
  const row = driver.queryOne<{
    anchor_link: string | null;
    anchor_resolution_status: string | null;
    parent_id: string | null;
  }>('SELECT anchor_link, anchor_resolution_status, parent_id FROM nodes WHERE id = ?', [id]);
  const anchor = parseStoredAnchorLink(row?.anchor_link ?? null);
  const status = row?.anchor_resolution_status;
  return {
    source: anchor && row?.parent_id ? {
      material_id: row.parent_id,
      anchor_kind: anchor.kind,
      resolution_status: status,
      locator: status?.startsWith('unmapped_') ? null : anchor.locator ?? null
    } : null,
    backlinks: loadNodeBacklinks(id)
  };
}
