import { insertImportedHighlightNodes } from '../../lib/core/database/importDerivedHighlights.js';
import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import { collectBoundaryFragments } from '../../lib/core/import/controlledContextText.js';
import type { PreparedReadwiseApiAnnotation } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';

import { resolveRelocationNodeId } from './readwiseApiEpubAnnotationRelocation.js';
import { placeReadwiseApiEpubHighlight } from './readwiseApiEpubHighlightPlacement.js';
import { ensureReadwiseUnlocatedNode } from './readwiseOriginalEpubUnlocated.js';

function placeUniqueHighlight(input: {
  bodies: Array<{ content: string; id: string }>;
  highlight: PreparedImportHighlightRecord;
  rootNodeId: string;
}) {
  const direct = input.bodies.filter((body) => applyImportedHighlightAnchors({
    content: body.content, highlights: [input.highlight]
  }).highlights.length === 1);
  if (direct.length === 1) return { highlight: input.highlight, parentId: direct[0]!.id };
  for (const fragment of collectBoundaryFragments(input.highlight.locatorText ?? '').sort(
    (left, right) => right.length - left.length
  )) {
    if (fragment.length < 12) continue;
    const matches = input.bodies.filter((body) => {
      const first = body.content.indexOf(fragment);
      return first >= 0 && body.content.indexOf(fragment, first + 1) < 0;
    });
    if (matches.length === 1) {
      return { highlight: { ...input.highlight, locatorText: fragment }, parentId: matches[0]!.id };
    }
  }
  return { highlight: { ...input.highlight, locatorText: null }, parentId: input.rootNodeId };
}

export function placeReadwiseApiEpubAnnotations(input: {
  annotations: PreparedReadwiseApiAnnotation[];
  annotationStates: ReadwiseApiAnnotationState[];
  bodies: Array<{ content: string; id: string }>;
  connectionRef: string;
  documentId: string;
  importedAt: string;
  relocationPolicy: 'first' | 'unique';
  rootNodeId: string;
}) {
  const grouped = new Map<string, PreparedImportHighlightRecord[]>();
  const placements = input.annotations.map((annotation) => {
    const placementInput = {
      bodies: input.bodies,
      highlight: {
      content: annotation.content,
      label: null,
      locatorText: annotation.locatorText,
      nodeId: resolveRelocationNodeId(input.connectionRef, input.annotationStates, annotation.remoteId)
      },
      rootNodeId: input.rootNodeId
    };
    return input.relocationPolicy === 'unique'
      ? placeUniqueHighlight(placementInput)
      : placeReadwiseApiEpubHighlight(placementInput);
  });
  const isUnlocated = (placement: typeof placements[number]) => (
    placement.parentId === input.rootNodeId && placement.highlight.locatorText === null
  );
  const unmatchedNodeId = placements.some(isUnlocated)
    ? ensureReadwiseUnlocatedNode({
      connectionRef: input.connectionRef,
      documentId: input.documentId,
      driver: openDatabaseConnection().driver,
      importedAt: input.importedAt,
      rootNodeId: input.rootNodeId
    })
    : null;
  for (const placement of placements) {
    const parentId = isUnlocated(placement)
      ? unmatchedNodeId ?? input.rootNodeId
      : placement.parentId;
    const values = grouped.get(parentId) ?? [];
    values.push(placement.highlight);
    grouped.set(parentId, values);
  }
  for (const [parentId, highlights] of grouped) persistGroup(input, parentId, highlights);
  return input.annotations.length;
}

function persistGroup(
  input: Parameters<typeof placeReadwiseApiEpubAnnotations>[0],
  parentId: string,
  highlights: PreparedImportHighlightRecord[]
) {
  const body = input.bodies.find((item) => item.id === parentId)?.content ?? '';
  const anchored = applyImportedHighlightAnchors({
    ambiguityPolicy: input.relocationPolicy,
    content: body,
    highlights
  });
  const anchoredIds = new Set(anchored.highlights.map((item) => item.nodeId));
  insertImportedHighlightNodes({
    driver: openDatabaseConnection().driver,
    highlights: [
      ...anchored.highlights,
      ...highlights.filter((item) => !anchoredIds.has(item.nodeId)).map((item) => ({ ...item, locatorText: null }))
    ],
    importedAt: input.importedAt,
    parentContent: body,
    parentNodeId: parentId
  });
}
