export type AnchorResolutionStatus = 'resolved' | 'unmapped_ambiguous' | 'unmapped_missing';

export interface ReceiptAnchor {
  anchorLink: string;
  childId: string;
}

export interface ReceiptCandidate {
  anchors: ReceiptAnchor[];
  nodeId: string;
  recoveryContent: string;
}

export interface BodyRecoveryReceipt {
  databasePath: string;
  mode: 'apply';
  plan: {
    apply: ReceiptCandidate[];
    generatedAt: string;
    planHash: string;
  };
  result: {
    applied: {
      recovered: Array<{ bodyHash: string; nodeId: string; versionId: string }>;
    };
  };
}

export interface AnchorRepairMutation {
  childId: string;
  expectedAnchorLink: string;
  expectedChildVersionId: string;
  expectedParentBodyHash: string;
  expectedParentVersionId: string;
  expectedStatus: string | null;
  nextAnchorLink: string;
  nextStatus: AnchorResolutionStatus;
  oldRanges: TextLocator[];
  newRanges: TextLocator[] | null;
  parentId: string;
  reason: 'unique_visible_match' | 'visible_match_ambiguous' | 'visible_match_missing';
  title: string;
}

export interface AnchorRepairPlan {
  apply: AnchorRepairMutation[];
  generatedAt: string;
  manualReview: Array<{ childId: string; parentId: string; reason: string; title: string }>;
  noRepair: Array<{ childId: string; parentId: string; reason: string; title: string }>;
  planHash: string;
  sourcePlanHash: string;
  unmap: AnchorRepairMutation[];
}

export interface TextLocator {
  from: number;
  originalText: string;
  to: number;
}
