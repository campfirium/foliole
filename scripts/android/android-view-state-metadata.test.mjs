// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const VIEW_STATE_SYNC_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionViewStateSyncStore.java'
);
const VIEW_STATE_PAYLOAD_RULES = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionViewStatePayloadRules.java'
);
const WORKSPACE_SNAPSHOT_EXPORTER = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionWorkspaceSnapshotExporter.java'
);

describe('Android view-state sync metadata', () => {
  it('loads view-state identity, payload fields, sources, and hash rules from generated metadata', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));
    const payloadRulesSource = await readFile(VIEW_STATE_PAYLOAD_RULES, 'utf8');
    const source = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');
    const snapshotSource = await readFile(WORKSPACE_SNAPSHOT_EXPORTER, 'utf8');

    expect(definitions.queries.syncPayloadViewActiveNode.syncPayload).toMatchObject({
      activeNodePayloadKey: 'active_node_id',
      defaultActiveNodeId: '',
      formFactor: 'phone',
      platform: 'android',
      recordDeletedAtKey: 'deleted_at',
      recordUpdatedAtKey: 'updated_at',
      scope: 'session_resume',
      workspaceMetaKey: 'active_node_id'
    });
    expect(definitions.queries.syncPayloadViewNodeState.syncPayload).toMatchObject({
      appliedSource: 'sync-apply',
      defaultScrollTop: 0,
      hashIgnoredPayloadKeys: ['source'],
      localSource: 'user-scroll',
      nodeIdPayloadKey: 'node_id',
      recordDeletedAtKey: 'deleted_at',
      recordUpdatedAtKey: 'updated_at',
      scrollTopPayloadKey: 'scroll_top',
      selectionFromPayloadKey: 'selection_from',
      selectionToPayloadKey: 'selection_to',
      sourcePayloadKey: 'source'
    });
    expect(source).toContain('FolioleCompanionSyncPayloadQueryStore.viewActiveNodePayloadKey(context)');
    expect(source).toContain('FolioleCompanionSyncPayloadQueryStore.viewActiveNodeWorkspaceMetaKey(context)');
    expect(source).toContain('FolioleCompanionSyncPayloadQueryStore.viewHashIgnoredPayloadKeys(context)');
    expect(source).toContain('FolioleCompanionSyncPayloadQueryStore.viewSyncAppliedSource(context)');
    expect(source).toContain('FolioleCompanionViewStatePayloadRules.activeNodeId(context, payload)');
    expect(payloadRulesSource).toContain('FolioleCompanionSyncPayloadQueryStore.metadata(context, queryName, key)');
    expect(snapshotSource).toContain('FolioleCompanionSyncPayloadQueryStore.viewActiveNodeWorkspaceMetaKey(context)');
    expect(source).not.toContain('key.equals("active_node")');
    expect(source).not.toContain('key.startsWith("node:")');
    expect(source).not.toContain('key.substring(5)');
    expect(source).not.toContain('"active_node_id"');
    expect(source).not.toContain('record.isNull("deleted_at")');
    expect(source).not.toContain('record.optString("updated_at")');
    expect(source).not.toContain('"user-scroll"');
    expect(source).not.toContain('"sync-apply"');
    expect(snapshotSource).not.toContain('ACTIVE_NODE_META_KEY = "active_node_id"');
  });
});
