import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type {
  NodeAnchorLinkPayload,
  NodeImageRegionGroupPayload,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutationPayloads.js';
import { deriveNodeTitleFromContent } from '../../lib/core/nodes/deriveNodeTitle.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import type { NodeKind } from '../../lib/core/nodes/nodeKind.js';
import { parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection } from '../database/connection.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { readAgentControlMaterial, type AgentMaterialReadPayload } from './agentControlMaterials.js';

export const AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT = 10_000;
export const AGENT_CONTROL_MATERIAL_WRITE_REVEAL_LIMIT = 4_000;

export interface AgentMaterialDeleteSoftResult {
  already_deleted: boolean;
  deleted: true;
  deleted_at: string;
  material_id: string;
}

interface MaterialSnapshotRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  body_blob_data: Uint8Array | string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string;
  manual_child_order: string | null;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  sequential_reading_enabled: number | null;
  shelved_at: string | null;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

export class AgentMaterialMutationError extends Error {
  constructor(
    readonly category: 'conflict' | 'invalid_request' | 'not_found',
    readonly statusCode: 400 | 404 | 409
  ) {
    super(category);
  }
}

export function updateAgentControlMaterial(input: {
  content?: string;
  expectedUpdatedAt: string;
  id: string;
  reveal?: string;
  title?: string;
}): AgentMaterialReadPayload {
  const row = readMaterialSnapshotRow(input.id);
  if (!row) throw new AgentMaterialMutationError('not_found', 404);
  ensureMaterialIsActive(input.id);
  if (row.updated_at !== input.expectedUpdatedAt) throw new AgentMaterialMutationError('conflict', 409);
  if (typeof input.title === 'string' && input.title.trim().length === 0) {
    throw new AgentMaterialMutationError('invalid_request', 400);
  }
  if (typeof input.content === 'string' && input.content.length > AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT) {
    throw new AgentMaterialMutationError('invalid_request', 400);
  }
  if (typeof input.reveal === 'string' && (
    row.kind !== 'item' || input.reveal.trim().length === 0
    || input.reveal.length > AGENT_CONTROL_MATERIAL_WRITE_REVEAL_LIMIT
  )) throw new AgentMaterialMutationError('invalid_request', 400);
  if (row.kind === 'item' && typeof input.content === 'string' && input.content.trim().length === 0) {
    throw new AgentMaterialMutationError('invalid_request', 400);
  }
  const hasExplicitTitle = typeof input.title === 'string';
  const title = hasExplicitTitle
    ? input.title!.trim()
    : row.kind === 'item' && !row.is_title_manual && typeof input.content === 'string'
      ? deriveNodeTitleFromContent(input.content)
      : row.title;
  rewriteAgentControlNodeSnapshot({
    content: input.content ?? readRowContent(row),
    id: input.id,
    ...(hasExplicitTitle ? { isTitleManual: true } : {}),
    ...(input.reveal === undefined ? {} : { reveal: input.reveal }),
    title
  });
  const material = readAgentControlMaterial(input.id);
  if (!material) throw new AgentMaterialMutationError('not_found', 404);
  return material;
}

export function rewriteAgentControlNodeSnapshot(input: {
  content?: string;
  id: string;
  isTitleManual?: boolean;
  manualChildOrder?: string[] | null;
  reveal?: string | null;
  title?: string;
  updatedAt?: string;
  virtualFilter?: ReturnType<typeof parseVirtualNodeFilter>;
}) {
  const row = readMaterialSnapshotRow(input.id);
  if (!row) throw new AgentMaterialMutationError('not_found', 404);
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const snapshot = toUpsertInput(row, {
    content: input.content ?? readRowContent(row),
    isTitleManual: input.isTitleManual ?? row.is_title_manual === 1,
    reveal: input.reveal ?? row.reveal,
    title: input.title ?? row.title,
    updatedAt
  });
  if (input.manualChildOrder !== undefined) snapshot.manualChildOrder = input.manualChildOrder;
  if (input.virtualFilter !== undefined) snapshot.virtualFilter = input.virtualFilter;
  upsertNodeSnapshot(snapshot);
  return updatedAt;
}

export function readAgentControlNodeSnapshot(id: string) {
  const row = readMaterialSnapshotRow(id);
  if (!row) throw new AgentMaterialMutationError('not_found', 404);
  return toUpsertInput(row, {
    content: readRowContent(row),
    title: row.title,
    updatedAt: row.updated_at
  });
}

export function softDeleteAgentControlMaterial(input: {
  expectedUpdatedAt?: string;
  id: string;
}): AgentMaterialDeleteSoftResult {
  const row = readMaterialSnapshotRow(input.id);
  if (!row) throw new AgentMaterialMutationError('not_found', 404);
  if (input.expectedUpdatedAt && row.updated_at !== input.expectedUpdatedAt) {
    throw new AgentMaterialMutationError('conflict', 409);
  }
  const material = readAgentControlMaterial(input.id);
  if (!material) throw new AgentMaterialMutationError('not_found', 404);
  if (row.deleted_at || material.deleted) {
    return { already_deleted: true, deleted: true, deleted_at: row.deleted_at ?? material.updated_at, material_id: input.id };
  }
  const deletedAt = new Date().toISOString();
  softDeleteNodes({ deletedAt, nodeIds: [input.id] });
  return { already_deleted: false, deleted: true, deleted_at: deletedAt, material_id: input.id };
}

function readMaterialSnapshotRow(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<MaterialSnapshotRow>(
    `SELECT n.id, n.parent_id, n.kind, n.priority, n.desired_retention, n.enable_short_term,
            n.sequential_reading_enabled, n.shelved_at, n.manual_child_order, n.title,
            n.is_title_manual, n.hide_title_heading, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
            n.virtual_filter, n.reveal, n.anchor_link, n.image_regions, n.position,
            n.created_at, n.updated_at, n.deleted_at
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
}

function ensureMaterialIsActive(nodeId: string) {
  const material = readAgentControlMaterial(nodeId);
  if (!material) throw new AgentMaterialMutationError('not_found', 404);
  if (material.deleted) throw new AgentMaterialMutationError('conflict', 409);
}

function toUpsertInput(
  row: MaterialSnapshotRow,
  next: { content: string; isTitleManual?: boolean; reveal?: string | null; title: string; updatedAt: string }
): UpsertNodeSnapshotInput {
  return {
    anchorLink: parseJson<NodeAnchorLinkPayload>(row.anchor_link),
    content: next.content,
    createdAt: row.created_at,
    desiredRetention: row.desired_retention,
    enableShortTerm: toOptionalBoolean(row.enable_short_term),
    hideTitleHeading: row.hide_title_heading === 1,
    imageRegions: parseJson<NodeImageRegionGroupPayload[]>(row.image_regions),
    isTitleManual: next.isTitleManual ?? row.is_title_manual === 1,
    kind: row.kind as NodeKind,
    manualChildOrder: parseManualChildOrder(row.manual_child_order),
    nodeId: row.id,
    parentNodeId: row.parent_id,
    position: row.position,
    priority: row.priority,
    reveal: next.reveal ?? row.reveal,
    sequentialReadingEnabled: toOptionalBoolean(row.sequential_reading_enabled),
    shelvedAt: row.shelved_at,
    title: next.title,
    updatedAt: next.updatedAt,
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter)
  };
}

function readRowContent(row: MaterialSnapshotRow) {
  return requireResolvedNodeBody(row, row.id).content;
}

function toOptionalBoolean(value: number | null) {
  return value === null ? null : value === 1;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
