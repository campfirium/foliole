export interface RepairBody {
  content: string;
  isTitleManual: number;
  nodeId: string;
  parentId: string | null;
  title: string;
}

export interface RepairHighlight {
  anchorLink: string;
  imageRegions: string | null;
  nodeId: string;
  parentId: string;
}

export interface RepairMove {
  nodeId: string;
  parentId: string;
}

export interface RepairAttachmentCopy {
  attachmentId: string;
  nodeId: string;
  role: string;
}

export interface ReadwiseEpubBookRepair {
  attachmentCopies: RepairAttachmentCopy[];
  bodies: RepairBody[];
  documentId: string;
  headingCount: number;
  highlights: RepairHighlight[];
  moves: RepairMove[];
  rootNodeId: string;
  sourceCoverageHash: string;
  currentCoverageHash: string;
  newCoverageHash: string;
  reusedNodeIds: string[];
  staleNodeIds: string[];
  title: string;
}

export interface ReadwiseEpubStructureRepairPlan {
  books: ReadwiseEpubBookRepair[];
  counts: {
    anchoredHighlights: number;
    attachmentCopies: number;
    books: number;
    bodies: number;
    headings: number;
    highlights: number;
    moves: number;
    rootHighlights: number;
    staleNodes: number;
    unanchoredHighlights: number;
  };
  corpusAudit: ReturnType<typeof import('./readwise-epub-corpus-audit.js').auditReadwiseEpubCorpus>;
  generatedAt: string;
  planHash: string;
  protection: {
    attachmentRelations: number;
    attachmentRelationsHash: string;
    immutableNodesHash: string;
    nonReadwiseRoots: number;
    nodeReviewRows: number;
    nodeReviewRowsHash: string;
    otherChildren: number;
    otherFactsIncludingNonReadwiseRoots: number;
    readwiseChildren: number;
    reviewLogRows: number;
    reviewLogRowsHash: string;
  };
}
