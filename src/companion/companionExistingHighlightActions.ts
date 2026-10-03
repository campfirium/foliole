import {
  appendHighlightCardNote,
  DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX
} from '../../lib/core/annotations/textAnnotationContent';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { getTextAnchorLocators } from '../features/nodes/model/nodeTypes';
import { findTextAnchorAtPosition } from '../shared/textAnchorTarget';

import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

export interface CompanionExistingHighlightTarget {
  kind?: 'highlight' | 'cloze';
  note?: string;
  nodeId: string;
  originalText: string;
}

function getHighlightNote(node: WorkspaceNodeSnapshot) {
  const marker = `\n${DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}`;
  const markerIndex = node.content.indexOf(marker);
  if (markerIndex < 0) return null;
  const note = node.content.slice(markerIndex + marker.length).trim();
  return note || null;
}

function toExistingHighlightTarget(node: WorkspaceNodeSnapshot | undefined): CompanionExistingHighlightTarget | null {
  const originalText = node ? getTextAnchorLocators(node.anchorLink?.locator)[0]?.originalText : null;
  const note = node ? getHighlightNote(node) : null;
  if (!node || !originalText) return null;
  return {
    nodeId: node.id,
    originalText,
    ...(note ? { note } : {})
  };
}

export function findCompanionExistingHighlightFromPayload(
  snapshot: WorkspaceSnapshot | null,
  payload: SelectionCommandPayload | null
): CompanionExistingHighlightTarget | null {
  if (!snapshot || !payload || payload.entries.length !== 1) return null;
  const locator = payload.entries[0]?.locator;
  if (!locator) return null;
  const parentNodeId = payload.parentNodeId;
  const trashed = new Set(snapshot.trashedNodeIds);
  const node = Object.values(snapshot.nodesById).find((candidate) =>
    candidate.parentNodeId === parentNodeId &&
    candidate.anchorLink?.kind === 'highlight' &&
    !trashed.has(candidate.id) &&
    getTextAnchorLocators(candidate.anchorLink?.locator).some((match) =>
      match.from === locator.from &&
      match.to === locator.to &&
      match.originalText === locator.originalText
    )
  );
  return toExistingHighlightTarget(node);
}

export function findCompanionExistingHighlightAtPosition(args: {
  parentNodeId: string;
  position: number;
  snapshot: WorkspaceSnapshot | null;
}): CompanionExistingHighlightTarget | null {
  if (!args.snapshot) return null;
  const match = findTextAnchorAtPosition(args.parentNodeId, args.snapshot.nodesById, args.position, args.snapshot.trashedNodeIds);
  if (!match) return null;
  if (match.kind === 'cloze') return { kind: 'cloze', nodeId: match.nodeId, originalText: match.originalText };
  return toExistingHighlightTarget(args.snapshot.nodesById[match.nodeId]);
}

export function appendCompanionExistingHighlightNote(args: {
  note: string;
  node: WorkspaceNodeSnapshot;
  originalText: string;
}) {
  return appendHighlightCardNote({
    content: args.node.content,
    note: args.note,
    originalText: args.originalText
  });
}

export function findCompanionClozeTarget(snapshot: WorkspaceSnapshot | null, nodeId: string): CompanionExistingHighlightTarget | null {
  const node = snapshot?.nodesById[nodeId];
  if (!node || node.kind !== 'item' || node.deletedAt || snapshot?.trashedNodeIds.includes(nodeId) ||
      node.anchorLink?.kind !== 'cloze') return null;
  const locators = getTextAnchorLocators(node.anchorLink?.locator);
  return locators.length ? { kind: 'cloze', nodeId, originalText: locators.map((locator) => locator.originalText).join(' … ') } : null;
}
