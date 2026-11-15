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
}
