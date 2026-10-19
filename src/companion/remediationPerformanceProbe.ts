import type { DbPort } from '../../lib/core/sync/dbPort';
import { expandRequestSyncNodeSummaries, flushRequestSyncInventoryDigests } from '../../lib/core/sync/framedSyncInventoryDigest';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead';
import { framedSyncInventorySummary } from '../../lib/core/sync/framedSyncInventorySummary';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { readCompanionAttachmentReferences } from '../shared/platform/companion/runtime/companionAttachmentReferenceSnapshot';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import {
  saveCompanionSyncNodeReadingRecord, saveCompanionSyncNodeReviewRecord,
  saveCompanionSyncSettingRecord, saveCompanionSyncActiveViewState
} from '../shared/platform/companionSyncStateWriters';

import { requireValue } from './capacityAcceptanceSafety';
import { COMPANION_CUSTOM_CSS_SETTING_KEY, createEmptyCompanionCustomCssCollection } from './companionCustomCssModel';
import { openRemediationPerformanceFixture, remediationImage } from './remediationPerformanceFixture';

type Fixture = Awaited<ReturnType<typeof openRemediationPerformanceFixture>>;
const reading = { intervalDurationMs: 86400000, intervalGrowthFactor: 2,
  lastHandledAt: '2026-10-19T00:00:00.000Z', nextAt: '2026-10-20T00:00:00.000Z',
  priority: 1, readingPosition: 17, repetitionCount: 1, state: 'active' as const };
const review = { difficulty: 5, due: '2026-10-20T00:00:00.000Z', elapsedDays: 1, lapses: 0,
  lastReviewAt: '2026-10-19T00:00:00.000Z', reps: 1, scheduledDays: 1, stability: 1, state: 2 as const };

export async function runRemediationPerformanceProbe(phase: (value: string) => void) {
  phase('fixture');
  const fixture = await openRemediationPerformanceFixture();
  try { return await measureRemediationPerformance(fixture, phase); }
  finally { await fixture.close(); }
}

export async function measureRemediationPerformance(fixture: Fixture, phase: (value: string) => void) {
  phase('attachment-scan');
  const scan = await measureScan(fixture);
  phase('reading-settings');
  const mixed = await measureMixedBatch(fixture);
  phase('sync-details');
  await fixture.owner.runWriter(db => db.transaction(flushRequestSyncInventoryDigests));
  const details = await fixture.owner.readSnapshot(measureDetails);
  return { fixtureNodes: 1000, bodyBytes: 4096, scan, mixed, details };
}

async function measureScan({ owner }: Fixture) {
  const started = performance.now();
  const references = await readCompanionAttachmentReferences(owner);
  const scanMs = performance.now() - started;
  requireValue(references.storageKeys.length === 1 && references.storageKeys[0] === remediationImage,
    'Attachment reference set changed');
  let queryCount = 0;
  let queuedAt = 0;
  let score: Promise<unknown> | undefined;
  let scoreCompletedAt = 0;
  const readSnapshot = owner.readSnapshot.bind(owner);
  owner.readSnapshot = (task, signal) => readSnapshot(db => task(countQueries(db, () => {
    queryCount++;
    if (score) return;
    queuedAt = performance.now();
    score = saveCompanionSyncNodeReviewRecord({ nodeId: 'remediation-0', review })
      .then(result => { requireValue(result, 'Review write did not persist'); scoreCompletedAt = performance.now(); });
  })), signal);
  let scanDiscardedForWrite = false;
  try { await readCompanionAttachmentReferences(owner); }
  catch (error) {
    if (!(error instanceof Error) || !['attachment_scan_database_changed', 'attachment_scan_foreground_write'].includes(error.message)) throw error;
    scanDiscardedForWrite = true;
  } finally { owner.readSnapshot = readSnapshot; await score; }
  requireValue(score && scanDiscardedForWrite, 'Concurrent write must invalidate the scan');
  requireValue(queryCount <= 131, 'Attachment scan exceeded the batch query bound');
  const persisted = await owner.readSnapshot(db => db.query('SELECT reps FROM node_review WHERE node_id = ?', ['remediation-0']));
  requireValue(persisted[0]?.reps === 1, 'Queued review did not reach SQLite');
  return { scanMs, scoreWaitAndWriteMs: scoreCompletedAt - queuedAt, queryCount, references: 1, scanDiscardedForWrite };
}

async function measureMixedBatch(fixture: Fixture) {
  await refreshCompanionWorkspaceAfterMutation();
  const before = fixture.fullReads();
  const css = JSON.stringify(createEmptyCompanionCustomCssCollection());
  const started = performance.now();
  requireValue(await saveCompanionSyncNodeReviewRecord({ nodeId: 'remediation-0', review }), 'Missing review');
  for (const nodeId of ['remediation-0', 'remediation-1']) {
    requireValue(await saveCompanionSyncNodeReadingRecord({ nodeId, reading }), 'Missing reading');
  }
  requireValue(await saveCompanionSyncSettingRecord({ key: COMPANION_CUSTOM_CSS_SETTING_KEY, valueJson: css }), 'Missing setting');
  requireValue(await saveCompanionSyncActiveViewState('remediation-1'), 'Missing active node');
  const displayed = await refreshCompanionWorkspaceAfterMutation();
  const elapsedMs = performance.now() - started;
  const fullReads = fixture.fullReads() - before;
  const complete = await fixture.owner.readSnapshot(loadIosCompanionWorkspaceSnapshot);
  requireValue(fullReads === 0, 'Mixed batch performed a full directory read');
  requireValue(JSON.stringify(displayed) === JSON.stringify(complete), 'Mixed snapshot differs from complete read');
  requireValue(displayed?.nodesById['remediation-1']?.reading?.readingPosition === 17, 'Reading was not published');
  const settings = await fixture.owner.readSnapshot(db => db.query('SELECT value_json FROM setting_records WHERE key = ?', [COMPANION_CUSTOM_CSS_SETTING_KEY]));
  requireValue(settings[0]?.value_json === css, 'Setting was not persisted');
  return { elapsedMs, fullReads, readingNodes: 2, snapshotMatches: true };
}

async function measureDetails(db: DbPort) {
  const full = await readRequestSyncInventorySnapshot(db);
  const summaries = framedSyncInventorySummary(full);
  const ids = full.filter(entry => entry.objectType === 'node').slice(0, 500).map(entry => entry.globalId);
  requireValue(ids.length === 500, 'Missing detail fixture nodes');
  let queryCount = 0;
  const started = performance.now();
  const expanded = await expandRequestSyncNodeSummaries(countQueries(db, () => queryCount++), summaries, ids);
  const elapsedMs = performance.now() - started;
  requireValue(queryCount === 1, 'Detail expansion was not batched');
  const selected = new Set(ids);
  requireValue(JSON.stringify(expanded.filter(entry => selected.has(entry.globalId))) ===
    JSON.stringify(full.filter(entry => selected.has(entry.globalId))), 'Expanded details changed');
  return { elapsedMs, queryCount, expandedNodes: ids.length, detailsMatch: true };
}

function countQueries(db: DbPort, onQuery: () => void): DbPort {
  return { run: (sql, params) => db.run(sql, params),
    query: (sql, params) => { onQuery(); return db.query(sql, params); },
    transaction: task => db.transaction(tx => task(countQueries(tx, onQuery))) };
}
