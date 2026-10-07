import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';

import type { DbPort, DbRow } from './dbPort.js';
import { remapRawAnchorLinkInContent } from './syncNodeAnchorRemap.js';
import { remapRawAnchorLinkInBody } from './syncNodeAnchorRemapBody.js';
import type { VerifiedBodyRef } from './verifiedBody.js';

export type SyncNodeAnchorUnmappedReason =
  | 'ambiguous_text'
  | 'invalid_anchor_link'
  | 'missing_text'
  | 'no_locator'
  | 'non_text_locator';

export interface SyncNodeAnchorRepairRecord {
  anchorId: string | null;
  nodeId: string;
  parentNodeId: string;
}

export interface SyncNodeAnchorUnmappedRecord {
  anchorId: string | null;
  nodeId: string;
  parentNodeId: string;
  reason: SyncNodeAnchorUnmappedReason;
}

interface ChildAnchorRow extends DbRow {
  anchor_link: string | null;
  id: string;
  image_regions: string | null;
}

function remapChildAnchorInContent(
  row: ChildAnchorRow,
  content: string
) {
  return remapRawAnchorLinkInContent({
    content,
    imageRegions: row.image_regions,
    value: row.anchor_link ?? ''
  });
}

async function* loadDirectChildAnchors(port: DbPort, parentNodeId: string) {
  let after: string | null = null;
  for (;;) {
    const rows: ChildAnchorRow[] = await port.query<ChildAnchorRow>(
      `SELECT id, anchor_link, image_regions FROM nodes
       WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL
         AND (? IS NULL OR id > ?) ORDER BY id LIMIT 32`,
      [parentNodeId, after, after]);
    if (rows.length === 0) return;
    for (const row of rows) yield row;
    after = rows[rows.length - 1]!.id;
  }
}

export async function repairDirectChildAnchorsForAppliedParent(input: {
  content: string | VerifiedBodyRef;
  excludedNodeIds?: ReadonlySet<string>;
  parentNodeId: string;
  port: DbPort;
  sourceVersionId: string | null;
  updatedAt: string;
}) {
  const repaired: SyncNodeAnchorRepairRecord[] = [];
  const unmapped: SyncNodeAnchorUnmappedRecord[] = [];
  for await (const row of loadDirectChildAnchors(input.port, input.parentNodeId)) {
    if (input.excludedNodeIds?.has(row.id)) {
      continue;
    }
    if (!row.anchor_link) {
      continue;
    }
    const anchorId = parseStoredAnchorLink(row.anchor_link)?.id ?? null;
    const result = typeof input.content === 'string'
      ? remapChildAnchorInContent(row, input.content)
      : await remapRawAnchorLinkInBody({ db: input.port, body: input.content,
        imageRegions: row.image_regions, value: row.anchor_link });
    if (!result) {
      await writeAnchorStatus(input.port, row.id, 'resolved', input.sourceVersionId, input.updatedAt);
      continue;
    }
    if (typeof result === 'string') {
      await writeAnchorStatus(
        input.port,
        row.id,
        result === 'ambiguous_text' ? 'unmapped_ambiguous' : 'unmapped_missing',
        input.sourceVersionId,
        input.updatedAt
      );
      unmapped.push({ anchorId, nodeId: row.id, parentNodeId: input.parentNodeId, reason: result });
      continue;
    }
    if (result.value === row.anchor_link && result.imageRegions === row.image_regions) {
      continue;
    }
    await input.port.run(`UPDATE nodes SET anchor_link = ?, image_regions = ?, anchor_resolution_status = 'resolved',
      anchor_source_version_id = ?, sync_dirty = 1, updated_at = ? WHERE id = ?`, [
      result.value,
      result.imageRegions,
      input.sourceVersionId,
      input.updatedAt,
      row.id
    ]);
    repaired.push({ anchorId, nodeId: row.id, parentNodeId: input.parentNodeId });
  }

  return { repaired, unmapped };
}

function writeAnchorStatus(
  port: DbPort,
  nodeId: string,
  status: 'resolved' | 'unmapped_ambiguous' | 'unmapped_missing',
  sourceVersionId: string | null,
  updatedAt: string
) {
  return port.run(
    `UPDATE nodes SET anchor_resolution_status = ?, anchor_source_version_id = ?, sync_dirty = 1, updated_at = ?
     WHERE id = ? AND (anchor_resolution_status IS NOT ? OR anchor_source_version_id IS NOT ?)`,
    [status, sourceVersionId, updatedAt, nodeId, status, sourceVersionId]
  );
}
