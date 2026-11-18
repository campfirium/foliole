import type { SuperMemoBibliography } from '../core/import/superMemoBibliography.js';
import type { SuperMemoGradeMap } from '../core/import/superMemoSchedulePreview.js';
import type { SuperMemoSourceFormat } from '../core/import/superMemoSourceFormatting.js';
import type { SuperMemoXmlDraftElement } from '../core/import/superMemoXmlDraft.js';

export type SuperMemoFolderChoice = { id: number; folder: boolean };

export interface NativeSuperMemoPreviewArgs {
  elements: SuperMemoXmlDraftElement[];
  collectionDirectory?: string;
  sourceFormat?: SuperMemoSourceFormat;
  gradeMap?: SuperMemoGradeMap;
  targetBatchId?: string;
  originalElements?: SuperMemoXmlDraftElement[];
  folderChoices?: SuperMemoFolderChoice[];
}

export interface NativeSuperMemoPreviewRow {
  id: number;
  parentId: number | null;
  sourceType: string;
  title: string;
  outcome: 'folder' | 'topic' | 'item' | 'skipped';
  issue: 'empty-topic' | 'empty-item' | 'missing-question' | 'missing-answer' | 'unsupported-type' | null;
  intervalDays: number | null;
  lastRepetition: string | null;
  historyCount: number;
  sourceDue: string | null;
  recalculatedDue: string | null;
  replayedCount: number;
  historyNeedsReview: boolean;
  localImages?: number;
  unresolvedImages?: { source: string; count: number }[];
  remoteImages?: number;
  skippedAudio?: number;
  sourceState?: 'pending' | 'active' | 'dismissed' | null;
  sourceRank?: number | null;
  sourceConceptGroupId?: number | null;
  sourceConceptFolderId?: number | null;
  sourceArticleId?: number | null;
  sourceExample?: string;
  sourceBibliography?: SuperMemoBibliography;
  sourceReferenceId?: number | null;
  sourceTitle?: string;
  sourceChildren?: number[];
  structure?: { parentId: number | null; editable: boolean; folderBody: boolean };
}

export interface NativeSuperMemoPreview {
  rows: NativeSuperMemoPreviewRow[];
  referenceDay: string;
  pairedCollection?: boolean;
  previewSignature?: string;
  directoryUpdate?: NativeSuperMemoDirectoryUpdate;
}

export interface SuperMemoMigrationForm {
  percent: number;
  sourceFormat: SuperMemoSourceFormat;
  folderChoices?: SuperMemoFolderChoice[];
  comparison?: { batchId: string; originalFilePath?: string | undefined };
}

export interface SuperMemoSourceLink extends SuperMemoMigrationForm {
  filePath: string;
  collectionDirectory: string | null;
}

export interface NativeSuperMemoSource {
  filePath: string;
  name: string;
  xml: string;
  collectionDirectory: string | undefined;
  collectionCandidates?: { directory: string; name: string }[];
  savedForm?: SuperMemoMigrationForm;
  collectionDiscoveryFailure?: 'access' | 'read';
}

export interface NativeSuperMemoCitationChange {
  sourceId: number;
  title: string;
  status: 'update' | 'protected';
}

export type NativeSuperMemoTextChange = {
  sourceId: number;
  title: string;
  field: 'body' | 'question' | 'answer';
} & ({ status: 'update' } | { status: 'protected'; reason: 'edited' | 'media' | 'anchor' });

export interface NativeSuperMemoFirstReviewChange {
  sourceId: number;
  title: string;
  from: string | null;
  to: string | null;
  status: 'update' | 'basis' | 'protected' | 'unavailable';
}

export interface NativeSuperMemoWithdrawal {
  sourceId: number;
  title: string;
  issue: 'empty-topic' | 'empty-item' | 'unsupported-type';
  protectedBy?: 'children' | 'modified' | 'published';
}

export interface NativeSuperMemoSourceMatch {
  status: 'verified' | 'unverified' | 'older-export';
  matched: number;
  additions: number;
  linkOnConfirm?: true;
  conflicts: Array<{ sourceId: number; title: string; reason: 'number-conflict' | 'renumbered' }>;
}

export interface NativeSuperMemoDirectoryUpdate {
  batchId: string;
  signature: string;
  pairedSourceRequired: boolean;
  sourceFormat?: SuperMemoSourceFormat;
  sourceMatch?: NativeSuperMemoSourceMatch;
  citationChanges: NativeSuperMemoCitationChange[];
  textChanges: NativeSuperMemoTextChange[];
  firstReviewChanges: NativeSuperMemoFirstReviewChange[];
  withdrawals: NativeSuperMemoWithdrawal[];
  withdrawnSourceIds: number[];
  changes: Array<{
    sourceId: number;
    title: string;
    from: string | null;
    to: string | null;
    status: 'add' | 'add-unavailable' | 'move' | 'anchor' | 'protected' | 'unavailable' | 'anchor-unverified';
    reanchor?: true;
    restoreAnchor?: true;
    missingParent?: true;
    toInbox?: true;
  }>;
}
