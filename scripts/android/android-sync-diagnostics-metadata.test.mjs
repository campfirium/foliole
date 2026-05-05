// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYNC_PROTOCOL_DEFINITIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'companion-sync-protocol-definitions.json'
);
const QUERY_DEFINITIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'companion-query-definitions.json'
);
const javaSource = (name) =>
  readFile(path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android', name), 'utf8');

describe('Android sync diagnostics metadata', () => {
  it('generates sync meta keys, diagnostic host, full-sync message, and verdict definitions', async () => {
    const definitions = JSON.parse(await readFile(SYNC_PROTOCOL_DEFINITIONS, 'utf8'));

    expect(definitions.syncMetaKeys).toMatchObject({
      endpointUrl: 'workspace_sync_endpoint_url',
      events: 'workspace_sync_events',
      lastSyncedAt: 'workspace_sync_last_synced_at',
      onboardingStatus: 'workspace_sync_onboarding_status',
      rememberedTargets: 'workspace_sync_remembered_targets'
    });
    expect(definitions.syncMetaOutputKeys).toMatchObject({
      endpointUrl: 'endpoint_url',
      syncEvents: 'sync_events',
      workspaceSnapshot: 'workspace_snapshot'
    });
    expect(definitions.syncEventRecordKeys).toMatchObject({
      endpointUrl: 'endpoint_url',
      occurredAt: 'occurred_at',
      status: 'status'
    });
    expect(definitions.syncEvents.fullSyncCompletedMessage).toBe('Sync fully completed.');
    expect(definitions.syncDiagnostics.host).toBe('android');
    expect(definitions.syncDiagnostics.outputKeys).toMatchObject({
      collectedAt: 'collected_at',
      syncState: 'sync_state',
      verdicts: 'verdicts'
    });
    expect(definitions.syncDiagnostics.identityKeys).toMatchObject({
      appVersion: 'app_version',
      databasePath: 'database_path'
    });
    expect(definitions.syncDiagnostics.stateKeys).toMatchObject({
      maxStateSeq: 'max_state_seq',
      packCursor: 'pack_cursor'
    });
    expect(definitions.syncDiagnostics.verdicts.endpointMissing).toEqual({
      code: 'android_endpoint_missing',
      message: 'This device has no desktop sync address.',
      severity: 'warning'
    });
    expect(Object.keys(definitions.syncDiagnostics.verdicts)).toContain('ready');
  });

  it('keeps Android sync meta and diagnostic Java wired to generated metadata', async () => {
    const sources = await Promise.all([
      javaSource('FolioleCompanionSyncMetaStore.java'),
      javaSource('FolioleCompanionSyncDiagnostics.java'),
      javaSource('FolioleCompanionSyncDiagnosticContent.java'),
      javaSource('FolioleCompanionSyncDiagnosticState.java'),
      javaSource('FolioleCompanionSyncDiagnosticVerdicts.java'),
      javaSource('FolioleCompanionSyncDiagnosticQueryRules.java'),
      javaSource('FolioleCompanionNamedQueryStore.java')
    ]);
    const combined = sources.join('\n');

    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", "endpointUrl")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", "events")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaOutputKeys", key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEventRecordKeys", key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.syncDiagnosticOutputKey(context, key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.syncDiagnosticIdentityKey(context, key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.syncDiagnosticConnectionKey(context, key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.syncDiagnosticStateKey(context, key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.syncDiagnosticVerdictKey(context, key)');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "fullSyncCompletedMessage")');
    expect(combined).toContain('FolioleCompanionSyncProtocolDefinitions.syncDiagnosticVerdict(context, key)');
    expect(combined).toContain('FolioleCompanionSyncDiagnosticQueryRules.contentOutputKey(context, key)');
    expect(combined).toContain('FolioleCompanionSyncDiagnosticQueryRules.object(context, "metricRows")');
    expect(combined).toContain('FolioleCompanionSyncDiagnosticQueryRules.array(context, "stateRowGroups")');
    expect(combined).toContain('FolioleCompanionQueryDefinitionShapeKeys.metricRowResultKey(context, metricRows)');
    expect(combined).toContain('FolioleCompanionQueryDefinitionShapeKeys.metricRowMetricKey(context, metricRows)');
    expect(combined).toContain('FolioleCompanionQueryDefinitionShapeKeys.diagnosticRowGroupOutputKey(context, rowGroup)');
    expect(combined).toContain('FolioleCompanionQueryDefinitionShapeKeys.diagnosticRowGroupQueryKey(context, rowGroup)');
    expect(combined).toContain('FolioleCompanionSyncDiagnosticQueryRules.verdictMetricKey(context, key)');
    expect(combined).toContain('FolioleCompanionMissingResourceQueryRules.contentObject(context, "summaryKeys")');
    expect(combined).toContain('FolioleCompanionQueryAssetKeys.section(context, "diagnosticRead")');
    expect(combined).not.toContain('"workspace_sync_endpoint_url"');
    expect(combined).not.toContain('"workspace_sync_events"');
    expect(combined).not.toContain('result.put("endpoint_url"');
    expect(combined).not.toContain('result.put("sync_events"');
    expect(combined).not.toContain('event.put("occurred_at"');
    expect(combined).not.toContain('result.put("collected_at"');
    expect(combined).not.toContain('outputKeys.getString("collectedAt")');
    expect(combined).not.toContain('identityKeys.getString("databasePath")');
    expect(combined).not.toContain('connectionKeys.getString("endpointUrl")');
    expect(combined).not.toContain('stateKeys.getString("packCursor")');
    expect(combined).not.toContain('verdictKeys.getString("code")');
    expect(combined).not.toContain('metricKeys.getString("activeNodeCount")');
    expect(combined).not.toContain('identity.put("database_path"');
    expect(combined).not.toContain('connection.put("endpoint_url"');
    expect(combined).not.toContain('state.put("pack_cursor"');
    expect(combined).not.toContain('verdict.put("evidence"');
    expect(combined).not.toContain('optLong("active_node_count"');
    expect(combined).not.toContain('optLong("push_issue_count"');
    expect(combined).not.toContain('"sync_pack_cursor"');
    expect(combined).not.toContain('"android_endpoint_missing"');
    expect(combined).not.toContain('"Android sync state is readable."');
    expect(combined).not.toContain('"Sync fully completed."');
    expect(combined).not.toContain('getJSONArray("metrics"');
    expect(combined).not.toContain('getString("metric"');
    expect(combined).not.toContain('getLong("value"');
    expect(combined).not.toContain('getString("metricKey"');
    expect(combined).not.toContain('getString("valueKey"');
    expect(combined).not.toContain('getString("outputKey"');
    expect(combined).not.toContain('getString("queryKey"');
    expect(combined).not.toContain('loadRows(context, database, "dirtyObjects"');
    expect(combined).not.toContain('loadRows(context, database, "pendingAcks"');
  });

  it('generates Android diagnostic query routing metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.diagnosticRead).toMatchObject({
      activeTopic: { queryName: 'diagnosticActiveTopic', resultKey: 'topics' },
      content: {
        outputKeys: {
          activeTopic: 'active_topic',
          recentTopics: 'recent_topics'
        },
        bodyMetricKeys: expect.arrayContaining(['missing_topic_body_count'])
      },
      dirtyObjects: { queryName: 'diagnosticDirtyObjects', resultKey: 'objects' },
      metaValue: { queryName: 'companionMetaValue' },
      metricRows: { resultKey: 'metrics', metricKey: 'metric', valueKey: 'value' },
      stateRowGroups: expect.arrayContaining([
        { outputKey: 'dirtyObjects', queryKey: 'dirtyObjects' },
        { outputKey: 'stateCounts', queryKey: 'stateCounts' }
      ]),
      stateMetrics: { queryName: 'diagnosticSyncStateMetrics' },
      storageMetrics: { queryName: 'diagnosticStorageMetrics' },
      verdictMetricKeys: {
        activeNodeCount: 'active_node_count',
        pushIssueCount: 'push_issue_count'
      }
    });
  });
});
