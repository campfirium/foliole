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

describe('Android sync payload routing metadata', () => {
  it('generates payload routes and compound view-state object identity rules', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.syncPayloadRouting).toMatchObject({
      defaultDeviceId: '*',
      objectIdDelimiter: ':',
      objectIdDeviceIdPartIndex: 3,
      objectIdKeyPartIndex: 4,
      objectIdPartLimit: 5
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
    const viewStateStore = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');

    expect(payloadStore).toContain('syncPayloadRouting(context).getJSONArray("routes")');
    expect(payloadStore).toContain('routingString(context, "objectIdDelimiter")');
    expect(payloadStore).toContain('routingInt(context, "objectIdPartLimit")');
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
    expect(payloadStore).not.toContain('Iterator<String> names = queries.keys()');
  });
});
