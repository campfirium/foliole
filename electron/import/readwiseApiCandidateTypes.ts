import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';

export const READWISE_API_PIPELINE_VERSION = 3;

export const READER_PARENT_CATEGORIES = [
  'article', 'email', 'epub', 'pdf', 'rss', 'tweet', 'video'
] as const;

export type ReaderParentCategory = typeof READER_PARENT_CATEGORIES[number];
export type CandidateStatus = 'completed' | 'failed' | 'pending' | 'ready';

export interface ReadwiseApiCandidateFailure {
  attemptCount: number;
  failedAt: string;
  reason: string | null;
  stage: 'fetching' | 'writing';
}

export interface ReadwiseApiCandidate {
  destination: Exclude<ReadwiseImportDestination, 'off'>;
  documentId: string;
  exportCategory: string | null;
  failure?: ReadwiseApiCandidateFailure;
  hasHighlights: boolean;
  highlightIds: string[];
  noteIds?: string[];
  matchedImportTag?: boolean;
  readerCategory: ReaderParentCategory | null;
  status: CandidateStatus;
  title: string | null;
}

export type ReadwiseApiIndexScope =
  | 'export'
  | 'reader:highlight'
  | 'reader:note'
  | 'reader:tag'
  | `reader:${ReaderParentCategory}`;

export interface ReadwiseApiScopeLedger {
  checkpoint: string | null;
  cursor: string | null;
  policySignature: string;
  runStartedAt: string;
  scope: ReadwiseApiIndexScope;
  status: 'complete' | 'running';
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
