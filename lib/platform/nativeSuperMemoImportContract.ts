import type { SuperMemoBibliography } from '../core/import/superMemoBibliography.js';
import type { SuperMemoGradeMap } from '../core/import/superMemoSchedulePreview.js';
import type { SuperMemoSourceFormat } from '../core/import/superMemoSourceFormatting.js';
import type { SuperMemoXmlDraftElement } from '../core/import/superMemoXmlDraft.js';

export interface NativeSuperMemoPreviewArgs {
  elements: SuperMemoXmlDraftElement[];
  collectionDirectory?: string;
  sourceFormat?: SuperMemoSourceFormat;
  gradeMap?: SuperMemoGradeMap;
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
  sourceChildren?: number[];
}

export interface NativeSuperMemoPreview {
  rows: NativeSuperMemoPreviewRow[];
  referenceDay: string;
  pairedCollection?: boolean;
  previewSignature?: string;
  directoryUpdate?: NativeSuperMemoDirectoryUpdate;
}

export interface NativeSuperMemoSource {
  filePath: string;
  name: string;
  xml: string;
  collectionDirectory: string | undefined;
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

export interface NativeSuperMemoDirectoryUpdate {
  batchId: string;
  signature: string;
  pairedSourceRequired: boolean;
  sourceFormat?: SuperMemoSourceFormat;
  citationChanges: NativeSuperMemoCitationChange[];
  textChanges: NativeSuperMemoTextChange[];
  firstReviewChanges: NativeSuperMemoFirstReviewChange[];
  changes: Array<{
    sourceId: number;
    title: string;
    from: string | null;
    to: string | null;
    status: 'add' | 'add-unavailable' | 'move' | 'protected' | 'unavailable' | 'anchor-unverified';
    reanchor?: true;
    missingParent?: true;
    toInbox?: true;
  }>;
}
