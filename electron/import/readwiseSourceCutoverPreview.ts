import { readwiseSourceCutoverProgress } from '../../lib/core/readwise/readwiseSourceCutover.js';
import type { NativeReadwiseSourceCutoverPreview } from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { countReadwiseApiFrozenResources } from '../database/readwiseApiFrozenResourceStage.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

interface SourceCountRow { [column: string]: unknown; count: number }

export async function previewReadwiseSourceCutover(): Promise<NativeReadwiseSourceCutoverPreview> {
  const current = loadReadwiseSourceCutover();
  if (current) {
    const connectionRef = loadReadwiseRemoteSource()?.connectionRef ?? '';
    const progress = readwiseSourceCutoverProgress(current);
    const indexing = current.status !== 'api' && current.version === 2
      ? current.phase !== 'merging' : current.status !== 'api';
    const frozenCount = countReadwiseApiFrozenResources(connectionRef);
    return {
      completed_count: indexing ? frozenCount : progress.completedCandidateCount,
      error_reason: firstReadwiseCandidateFailureReason(),
      phase: current.status === 'api' ? null : indexing ? 'indexing' : 'merging',
      status: current.status === 'api' ? 'already_completed' : 'migration_in_progress',
      topic_count: countCurrentHostTopics(current.sourceHost),
      total_count: indexing && current.version === 2 && current.cohortDocumentIds.length === 0
        ? null : progress.totalCandidateCount
    };
  }
  const assignment = loadReadwiseHostAssignment();
  return {
    completed_count: 0, error_reason: null, phase: null,
    status: assignment.is_active ? 'ready' : 'not_active_host',
    topic_count: countCurrentHostTopics(assignment.current_host_name), total_count: null
  };
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
