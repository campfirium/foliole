import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseSyncPreviewEntry, NativeReadwiseSyncPreviewResult } from '../../lib/platform/nativeImportContract.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';

export function buildReadwiseApiCandidatePreview(
  _settings: ImportManagerSettings,
  connectionRef: string,
  candidates: ReadwiseApiCandidate[]
): NativeReadwiseSyncPreviewResult {
  const entries = candidates.slice(0, 200).map((candidate) => entry(connectionRef, candidate));
  const completed = candidates.filter((candidate) => candidate.status === 'completed').length;
  const failed = candidates.filter((candidate) => candidate.status === 'failed').length;
  const pending = candidates.length - completed;
  return {
    active_count: completed,
    batch_count: pending,
    blocked_count: 0,
    degraded_count: failed,
    entries,
    estimated_seconds: Math.ceil(pending * 3.2),
    external_count: candidates.filter((candidate) => candidate.destination === 'external').length,
    failed_count: failed,
    inbox_count: candidates.filter((candidate) => candidate.destination === 'inbox').length,
    mode: 'api',
    off_count: 0,
    previewed_at: new Date().toISOString(),
    readwise_root_path: '',
    remaining_count: pending,
    removed_count: 0,
    total_count: candidates.length,
    trash_count: 0,
    unmatched_annotation_count: 0,
    with_highlights_count: candidates.filter((candidate) => candidate.hasHighlights).length,
    without_highlights_count: candidates.filter((candidate) => !candidate.hasHighlights).length,
    write_count: pending
  };
}

function entry(connectionRef: string, candidate: ReadwiseApiCandidate): NativeReadwiseSyncPreviewEntry {
  const existing = loadReadwiseApiImportSource(connectionRef, candidate.documentId);
  return {
    destination: existing ? 'inbox' : candidate.destination,
    detail: null,
    detected_highlight_count: candidate.highlightIds.length,
    highlight_type: candidate.hasHighlights ? 'with_highlights' : 'without_highlights',
    remote_document_id: candidate.documentId,
    source_kind: candidate.readerCategory ?? 'article',
    source_path: candidate.title ?? candidate.documentId,
    status: candidate.status === 'failed' ? 'failed'
      : candidate.status === 'completed' ? 'unchanged'
      : existing ? 'updated' : 'new'
  };
}
