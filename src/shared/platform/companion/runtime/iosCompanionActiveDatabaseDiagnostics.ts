import type { DbRow } from '../../../../../lib/core/sync/dbPort';
import type { SyncDiagnosticSnapshot } from '../../../../../lib/platform/syncDiagnosticsContract';

import { queryIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

type PairingState = { device_id?: string | null; device_name?: string | null; is_paired?: boolean };

export async function diagnoseIosCompanionDatabase(pairing: PairingState): Promise<SyncDiagnosticSnapshot> {
  const [storage, stateMetrics, bodyMetrics, blobRows, attachmentRows, activeTopics, recentTopics, dirty,
    pending, issues, counts, conflicts, endpoint, cursor, events] = await Promise.all([
    metrics('diagnosticStorageMetrics'), metrics('diagnosticSyncStateMetrics'), metrics('diagnosticContentBodyMetrics'),
    queryIosCompanionDatabase<DbRow>('contentBlobMissingSummaryRows'),
    queryIosCompanionDatabase<DbRow>('attachmentResourceMissingSummaryRows'),
    queryIosCompanionDatabase<DbRow>('diagnosticActiveTopic'), queryIosCompanionDatabase<DbRow>('diagnosticRecentTopics'),
    queryIosCompanionDatabase<DbRow>('diagnosticDirtyObjects'), queryIosCompanionDatabase<DbRow>('diagnosticPendingAcks'),
    queryIosCompanionDatabase<DbRow>('diagnosticPushIssues'), queryIosCompanionDatabase<DbRow>('diagnosticSyncStateCounts'),
    queryIosCompanionDatabase<DbRow>('nodeConflicts'), meta('workspace_sync_endpoint_url'), meta('sync_pack_cursor'),
    meta('workspace_sync_events')
  ]);
  const attachment = attachmentSummary(attachmentRows);
  const content = { ...bodyMetrics, ...blobSummary(blobRows), ...attachment,
    active_topic: activeTopics[0] ?? null, recent_topics: recentTopics };
  const maxStateSeq = numberOrNull(stateMetrics.max_state_seq);
  return {
    collected_at: new Date().toISOString(),
    connection: { endpoint_url: endpoint, last_error: null, state: pairing.is_paired && endpoint ? 'ready' : 'missing' },
    content: content as SyncDiagnosticSnapshot['content'], events: parseEvents(events), host: 'ios',
    identity: { app_version: null, database_path: getIosCompanionDatabaseOwner().databasePath,
      device_id: pairing.device_id ?? null, device_name: pairing.device_name ?? null },
    storage: storage as unknown as SyncDiagnosticSnapshot['storage'],
    sync_state: { ...stateMetrics, dirty_objects: dirty, max_state_seq: maxStateSeq,
      pack_cursor: cursor === null ? null : Number(cursor), pending_acks: pending, push_issues: issues,
      recent_conflicts: conflicts, state_counts: counts } as unknown as SyncDiagnosticSnapshot['sync_state'],
    verdicts: []
  };
}

async function metrics(name: 'diagnosticStorageMetrics' | 'diagnosticSyncStateMetrics' | 'diagnosticContentBodyMetrics') {
  const rows = await queryIosCompanionDatabase<{ metric: string; value: number } & DbRow>(name);
  return Object.fromEntries(rows.map((row) => [row.metric, row.value]));
}

async function meta(key: string) {
  const rows = await queryIosCompanionDatabase<{ value: string | null } & DbRow>('companionMetaValue', [key]);
  return rows[0]?.value ?? null;
}

function blobSummary(rows: DbRow[]) {
  const failed = rows.filter((row) => row.availability === 'failed');
  return { missing_content_blob_count: rows.length, missing_content_blob_bytes: sum(rows),
    failed_content_blob_count: failed.length, failed_content_blob_bytes: sum(failed) };
}

function attachmentSummary(rows: DbRow[]) {
  const missing = rows.filter((row) => row.availability !== 'cached' || !hasText(row.storage_key));
  const failed = missing.filter((row) => row.availability === 'failed');
  const image = missing.filter((row) => String(row.mime_type).startsWith('image/'));
  const pdf = missing.filter((row) => row.mime_type === 'application/pdf');
  const other = missing.filter((row) => !image.includes(row) && !pdf.includes(row));
  return { missing_attachment_resource_count: missing.length, missing_attachment_resource_bytes: sum(missing),
    failed_attachment_resource_count: failed.length, failed_attachment_resource_bytes: sum(failed),
    missing_active_topic_attachment_resource_count: missing.filter((row) => Number(row.active_topic) === 1).length,
    missing_due_review_attachment_resource_count: missing.filter((row) => Number(row.due_review) === 1).length,
    ...category('image', image), ...category('pdf', pdf), ...category('other', other) };
}

function category(name: string, rows: DbRow[]) { return { [`missing_${name}_attachment_resource_count`]: rows.length,
  [`missing_${name}_attachment_resource_bytes`]: sum(rows) }; }
function sum(rows: DbRow[]) { return rows.reduce((total, row) => total + Number(row.size_bytes ?? 0), 0); }
function hasText(value: unknown) { return typeof value === 'string' && value.trim().length > 0; }
function numberOrNull(value: unknown) { const number = Number(value ?? 0); return number > 0 ? number : null; }
function parseEvents(value: string | null) { if (!value) return []; try { return JSON.parse(value) as SyncDiagnosticSnapshot['events']; } catch { return []; } }
