import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseReaderSettings.js';

export const READWISE_API_PIPELINE_VERSION = 2;

export const READER_PARENT_CATEGORIES = [
  'article', 'email', 'epub', 'pdf', 'rss', 'tweet', 'video'
] as const;

export type ReaderParentCategory = typeof READER_PARENT_CATEGORIES[number];
export type CandidateStatus = 'completed' | 'failed' | 'pending' | 'ready';

export interface ReadwiseApiCandidate {
  destination: ReadwiseImportDestination;
  documentId: string;
  exportCategory: string | null;
  hasHighlights: boolean;
  highlightIds: string[];
  readerCategory: ReaderParentCategory | null;
  status: CandidateStatus;
  title: string | null;
}

export interface ReadwiseApiCandidateManifest {
  pipelineVersion: number;
  scopeSignature: string;
}

export interface ReadwiseApiCandidateRun {
  connectionRef: string;
  cursor: string | null;
  phase: 'export' | 'ready' | `reader:${ReaderParentCategory}`;
  queryUpdatedAfter: string | null;
  roundStartedAt: string;
}
