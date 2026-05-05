// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const SYNC_PAYLOAD_QUERY_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncPayloadQueryStore.java'
);
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
const SYNC_PAYLOAD_JSON = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncPayloadJson.java'
);
const SYNC_PAYLOAD_ROUTING_RULES = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncPayloadRoutingRules.java'
);

describe('Android sync payload routing metadata', () => {
  it('generates payload routes and compound view-state object identity rules', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.assetKeys).toMatchObject({
      contentRead: 'contentRead',
      diagnosticRead: 'diagnosticRead',
      missingResourceRead: 'missingResourceRead',
      nodeAttachmentRead: 'nodeAttachmentRead',
      queryShape: 'queryShape',
      queries: 'queries',
      resourceRead: 'resourceRead',
      runtimeQueries: 'runtimeQueries',
      syncConflictRead: 'syncConflictRead',
      syncObjectRead: 'syncObjectRead',
      syncStreamRead: 'syncStreamRead',
      syncPayloadRouting: 'syncPayloadRouting',
      workspaceRead: 'workspaceRead'
    });
    expect(definitions.queryShape).toMatchObject({
      column: { key: 'key', source: 'source', type: 'type' },
      columnTypes: { double: 'double', json: 'json', long: 'long' },
      query: { columns: 'columns', resultKey: 'resultKey', sql: 'sql', syncPayload: 'syncPayload' },
      routing: { routes: 'routes' }
    });
    expect(definitions.syncPayloadRouting).toMatchObject({
      argModeKey: 'argMode',
      defaultDeviceId: '*',
      deletedAtKey: 'deleted_at',
      objectIdArgMode: 'object_id',
      objectIdDelimiter: ':',
      objectIdDeviceIdPartIndex: 3,
      objectIdKey: 'object_id',
      objectIdKeyPartIndex: 4,
      objectIdPartLimit: 5,
      objectTypeKey: 'object_type',
      payloadJsonKey: 'payload_json',
      queryNameKey: 'queryName'
    });
    expect(definitions.syncPayloadRouting.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ objectType: 'attachment', queryName: 'syncPayloadAttachment' }),
        expect.objectContaining({ objectType: 'setting', queryName: 'syncPayloadSetting' }),
        expect.objectContaining({
          argMode: 'none',
          objectIdKey: 'active_node',
          objectType: 'view_state',
          queryName: 'syncPayloadViewActiveNode'
        }),
        expect.objectContaining({
          argMode: 'view_state_node',
          objectIdPrefix: 'node:',
          objectType: 'view_state',
          queryName: 'syncPayloadViewNodeState'
        })
      ])
    );
  });

  it('keeps Java payload routing and view-state object ids driven by generated metadata', async () => {
    const payloadStore = await readFile(SYNC_PAYLOAD_QUERY_STORE, 'utf8');
    const payloadJson = await readFile(SYNC_PAYLOAD_JSON, 'utf8');
    const payloadRoutingRules = await readFile(SYNC_PAYLOAD_ROUTING_RULES, 'utf8');
    const viewStateStore = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');

    expect(payloadStore).toContain('FolioleCompanionQueryDefinitionShapeKeys.routingKey(context, "routes")');
    expect(payloadStore).toContain('FolioleCompanionQueryDefinitionShapeKeys.queryKey(context, "syncPayload")');
    expect(payloadStore).toContain('routingString(context, "objectIdDelimiter")');
    expect(payloadStore).toContain('routingInt(context, "objectIdPartLimit")');
    expect(payloadStore).toContain('row.getString(routingString(context, "objectTypeKey"))');
    expect(payloadStore).toContain('route.getString(routingString(context, "queryNameKey"))');
    expect(payloadJson).toContain('FolioleCompanionSyncPayloadRoutingRules.string(context, "payloadJsonKey")');
    expect(payloadRoutingRules).toContain('FolioleCompanionQueryAssetKeys.section(context, "syncPayloadRouting")');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.viewObjectId(context, deviceId, key)');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.viewObjectIdKey(context, objectId)');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.viewObjectIdDeviceId(context, objectId)');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.isViewNodeKey(context, key)');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.viewNodeIdFromKey(context, key)');
    expect(payloadStore).toContain('static boolean isViewNodeKey');
    expect(payloadStore).toContain('static String viewNodeIdFromKey');
    expect(viewStateStore).not.toContain('objectId.split(":", 5)');
    expect(viewStateStore).not.toContain('key.startsWith(nodePrefix)');
    expect(viewStateStore).not.toContain('key.substring(nodePrefix.length())');
    expect(payloadStore).not.toContain('objectId.split(":", 5)');
    expect(payloadStore).not.toContain('row.getString("object_type")');
    expect(payloadStore).not.toContain('row.put("payload_json"');
    expect(payloadJson).not.toContain('record.opt("payload_json"');
    expect(payloadJson).not.toContain('routing.getString("payloadJsonKey")');
    expect(payloadStore).not.toContain('route.getString("queryName")');
    expect(payloadStore).not.toContain('getJSONObject("syncPayload")');
    expect(payloadStore).not.toContain('getJSONArray("routes")');
    expect(payloadStore).not.toContain('Iterator<String> names = queries.keys()');
    expect(payloadStore).toContain('FolioleCompanionQueryAssetKeys.key(context, "queries")');
    expect(payloadStore).toContain('FolioleCompanionQueryAssetKeys.key(context, "syncPayloadRouting")');
    expect(payloadStore).not.toContain('optJSONObject("queries")');
    expect(payloadStore).not.toContain('optJSONObject("syncPayloadRouting")');
  });
});
