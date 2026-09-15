import type { RepairHighlight } from './readwise-epub-structure-repair-types.js';

export interface DuplicateRootBookMerge {
  apiRootId: string;
  apiTitle: string;
  directApiChildIds: string[];
  documentId: string;
  generatedTransfers: Array<{ sourceId: string; targetId: string }>;
  highlightMerges: Array<{ sourceId: string; targetId: string }>;
  legacyGeneratedIds: string[];
  legacyRootId: string;
  legacyTitle: string;
  moves: Array<{ nodeId: string; parentId: string }>;
  relocatedHighlights: RepairHighlight[];
  rootBody: string;
  rootBodyHash: string;
  unlocatedNodeId: string;
}

export interface DuplicateRootRepairPlan {
  books: DuplicateRootBookMerge[];
  generatedAt: string;
  planHash: string;
  summary: {
    books: number;
    generatedRetired: number;
    highlightMerges: number;
    highlightsRelocated: number;
    inboxRootsRetired: number;
    unmatchedApiBooks: number;
  };
}
