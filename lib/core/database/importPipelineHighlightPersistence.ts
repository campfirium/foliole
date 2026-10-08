import type { PersistedImportRecord, PreparedImportHighlightRecord, PreparedImportRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import type { applyImportedHighlightAnchors } from './importHighlightAnchors.js';
import { replaceImportedHighlightNodes } from './importPipelineHighlightNodes.js';

export function persistImportedHighlightNodes(input: {
  anchoredContent: string;
  driver: DatabaseDriver;
  duplicateSemantic: PersistedImportRecord['duplicateSemantic'];
  importedAt: string;
  nodeId: string;
  prepared: PreparedImportRecord;
  preserveExistingHighlightNodes: boolean;
  resetImportedStructure: boolean;
  prepareDeletionVersions?: (nodeIds: string[], deletedAt: string) => void;
  budgetFailures?: string[];
  rejectedHighlights?: PreparedImportHighlightRecord[];
  matchedAnchoredHighlights: Array<PreparedImportHighlightRecord | ReturnType<typeof applyImportedHighlightAnchors>['highlights'][number]>;
}) {
  if (input.preserveExistingHighlightNodes) return;
  if (input.prepared.sourceProfile !== 'body_with_highlight_sidecar' || input.resetImportedStructure) {
    replaceImportedHighlightNodes({
      driver: input.driver,
      ...(input.budgetFailures ? { budgetFailures: input.budgetFailures } : {}),
      ...(input.rejectedHighlights ? { rejectedHighlights: input.rejectedHighlights } : {}),
      highlights: input.matchedAnchoredHighlights as ReturnType<typeof applyImportedHighlightAnchors>['highlights'],
      importedAt: input.importedAt,
      ...(input.prepareDeletionVersions ? { prepareDeletionVersions: input.prepareDeletionVersions } : {}),
      parentNodeId: input.nodeId,
      parentContent: input.anchoredContent
    });
    return;
  }
  if (input.duplicateSemantic !== 'new') {
    return;
  }
  insertImportedHighlightNodes({
    driver: input.driver,
    ...(input.budgetFailures ? { budgetFailures: input.budgetFailures } : {}),
    highlights: input.matchedAnchoredHighlights,
    importedAt: input.importedAt,
    parentNodeId: input.nodeId,
    parentContent: input.anchoredContent
  });
}
