import {
  READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
  readwiseSourceCutoverProgress
} from '../../lib/core/readwise/readwiseSourceCutover.js';
import type { NativeReadwiseSourceCutoverPreview } from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

interface SourceCountRow { [column: string]: unknown; count: number }

export async function previewReadwiseSourceCutover(): Promise<NativeReadwiseSourceCutoverPreview> {
  const current = loadReadwiseSourceCutover();
  const completed = current?.version === 2 && current.status === 'api'
    && current.completionVersion === READWISE_SOURCE_CUTOVER_COMPLETION_VERSION;
  if (current && (current.status === 'migration-in-progress' || completed)) {
    const connectionRef = loadReadwiseRemoteSource()?.connectionRef ?? '';
    const progress = readwiseSourceCutoverProgress(current);
    const indexing = current.status !== 'api' && current.version === 2
      ? current.phase !== 'merging' : current.status !== 'api';
    const topicCount = countCurrentHostTopics(current.sourceHost);
    const importedCount = countStagedFacts(connectionRef);
    const mergedCount = current.version === 2
      ? new Set([
          ...(current.unmatchedLegacy ?? []).map((item) => item.nodeId),
          ...current.documents.flatMap((item) => item.status === 'bound' && item.nodeId ? [item.nodeId] : [])
        ]).size
      : progress.completedCandidateCount;
    return {
      completed_count: indexing ? importedCount : mergedCount,
      error_reason: current.version === 2
        ? current.errorReason ?? firstReadwiseCandidateFailureReason()
        : firstReadwiseCandidateFailureReason(),
      phase: completed ? null : indexing ? 'indexing' : 'merging',
      status: completed ? 'already_completed' : 'migration_in_progress',
      topic_count: topicCount,
      total_count: indexing ? null : topicCount
    };
  }
  const assignment = loadReadwiseHostAssignment();
  return {
    completed_count: 0, error_reason: null, phase: null,
    status: assignment.is_active ? 'ready' : 'not_active_host',
    topic_count: countCurrentHostTopics(assignment.current_host_name), total_count: null
  };
}

function countStagedFacts(connectionRef: string) {
  return openDatabaseConnection().driver.queryOne<SourceCountRow>(
    `SELECT COUNT(*) count FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind IN ('reader','export')`,
    [connectionRef]
  )?.count ?? 0;
}

export function firstReadwiseCandidateFailureReason() {
  const connectionRef = loadReadwiseRemoteSource()?.connectionRef;
  if (!connectionRef) return null;
  return loadReadwiseApiCandidates(connectionRef)
    .find((candidate) => candidate.status === 'failed')?.failure?.reason ?? null;
}

function countCurrentHostTopics(hostName: string) {
  return openDatabaseConnection().driver.queryOne<SourceCountRow>(
    'SELECT COUNT(DISTINCT i.latest_node_id) count FROM import_sources i ' +
      'JOIN desktop_sources d ON d.source_ref = i.source_ref ' +
      'JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL ' +
      "WHERE d.source_type = 'readwise' AND d.host_name = ?",
    [hostName]
  )?.count ?? 0;
}
