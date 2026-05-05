import { appendHighlightCardNote } from '../../lib/core/annotations/textAnnotationContent';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';

import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

export interface CompanionExistingHighlightTarget {
  nodeId: string;
  originalText: string;
}

function isTextLocator(value: unknown): value is { from: number; originalText: string; to: number } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { from?: unknown }).from === 'number' &&
      typeof (value as { to?: unknown }).to === 'number' &&
      typeof (value as { originalText?: unknown }).originalText === 'string'
  );
}

function getLocators(node: WorkspaceNodeSnapshot) {
  const locator = node.anchorLink?.locator;
  if (isTextLocator(locator)) return [locator];
  if (locator && typeof locator === 'object' && Array.isArray((locator as { ranges?: unknown }).ranges)) {
    return (locator as { ranges: unknown[] }).ranges.filter(isTextLocator);
  }
  return [];
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
    getLocators(candidate).some((match) =>
      match.from === locator.from &&
      match.to === locator.to &&
      match.originalText === locator.originalText
    )
  );
  const originalText = node ? getLocators(node)[0]?.originalText : null;
  return node && originalText ? { nodeId: node.id, originalText } : null;
}

export function findCompanionExistingHighlightAtPosition(args: {
  parentNodeId: string;
  position: number;
  snapshot: WorkspaceSnapshot | null;
}): CompanionExistingHighlightTarget | null {
  if (!args.snapshot) return null;
  const trashed = new Set(args.snapshot.trashedNodeIds);
  const node = Object.values(args.snapshot.nodesById).find((candidate) =>
    candidate.parentNodeId === args.parentNodeId &&
    candidate.anchorLink?.kind === 'highlight' &&
    !trashed.has(candidate.id) &&
    getLocators(candidate).some((locator) => locator.from <= args.position && args.position <= locator.to)
  );
  const originalText = node ? getLocators(node)[0]?.originalText : null;
  return node && originalText ? { nodeId: node.id, originalText } : null;
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
