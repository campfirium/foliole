// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';
import { computeSyncContentHash } from '../../lib/core/database/syncState.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android');
const SYNC_PROTOCOL_DEFINITIONS = path.join(
  REPO_ROOT,
  'android/app/src/main/assets/companion-sync-protocol-definitions.json'
);
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android/app/src/main/assets/companion-query-definitions.json');
const SYNC_CONTENT_HASH = path.join(JAVA_ROOT, 'FolioleCompanionSyncContentHash.java');
const SYNC_PAYLOAD_QUERY_STORE = path.join(JAVA_ROOT, 'FolioleCompanionSyncPayloadQueryStore.java');
const SYNC_STATE_WRITE_STORE = path.join(JAVA_ROOT, 'FolioleCompanionSyncStateWriteStore.java');
const VIEW_STATE_SYNC_STORE = path.join(JAVA_ROOT, 'FolioleCompanionViewStateSyncStore.java');

describe('Android sync state payload semantics convergence', () => {
  it('generates scoped state identity rules from shared protocol definitions', async () => {
    const definitions = JSON.parse(await readFile(SYNC_PROTOCOL_DEFINITIONS, 'utf8'));

    expect(definitions.syncStateObjectIdentity).toEqual(
      ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncStateObjectIdentity
    );
    expect(definitions.syncStateObjectIdentity).toEqual({
      defaultScope: 'workspace',
      scopedObjectIdDelimiter: ':',
      scopedObjectIdPartLimit: 5,
      scopedObjectTypes: ['setting', 'view_state'],
      scopePartIndex: 0
    });
  });

  it('keeps Java state writes consuming generated identity and payload routing rules', async () => {
    const queryDefinitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));
    const payloadQueryStore = await readFile(SYNC_PAYLOAD_QUERY_STORE, 'utf8');
    const stateWriteStore = await readFile(SYNC_STATE_WRITE_STORE, 'utf8');
    const viewStateStore = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');

    expect(queryDefinitions.syncPayloadRouting).toMatchObject({
      objectIdDelimiter: ':',
      objectIdDeviceIdPartIndex: 3,
      objectIdKeyPartIndex: 4,
      objectIdPartLimit: 5
    });
    expect(queryDefinitions.queries.syncPayloadNodeTextAlternative.sql).not.toContain('json_object');
    expect(queryDefinitions.queries.syncPayloadNodeTextAlternative.columns.map(({ key }) => key)).toEqual([
      'alternative_id',
      'node_id',
      'source_version_id',
      'body_text',
      'source_device_id',
      'created_at',
      'status',
      'updated_at'
    ]);
    expect(payloadQueryStore).toContain('routingString(context, "objectIdDelimiter")');
    expect(payloadQueryStore).toContain('routingInt(context, "objectIdPartLimit")');
    expect(payloadQueryStore).toContain('routingInt(context, "objectIdDeviceIdPartIndex")');
    expect(stateWriteStore).toContain('FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, key)');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.viewObjectId(context, deviceId, key)');
    expect(viewStateStore).toContain('FolioleCompanionSyncPayloadQueryStore.viewObjectIdKey(context, objectId)');
    expect(`${stateWriteStore}\n${viewStateStore}`).not.toContain('"node_reading"');
    expect(`${stateWriteStore}\n${viewStateStore}`).not.toContain('"view_state"');
    expect(payloadQueryStore).not.toContain('objectId.split(":", 5)');
  });

  it('keeps content hash fixtures stable across TS and Android stable JSON rules', async () => {
    const hashSource = await readFile(SYNC_CONTENT_HASH, 'utf8');

    expect(hashSource).toContain('MessageDigest.getInstance("SHA-256")');
    expect(hashSource).toContain('Collections.sort(keys)');
    expect(hashSource).toContain('JSONObject.quote(key) + ":" + stableJson(object.get(key))');
    expect(computeSyncContentHash('node_reading', {
      interval_duration_ms: 10,
      interval_growth_factor: 1.5,
      last_handled_at: '2026-04-30T01:08:00.000Z',
      next_at: '2026-04-30T01:18:00.000Z',
      node_id: 'node-1',
      priority: 2,
      repetition_count: 3,
      state: 'active'
    })).toBe('44c6016bcfb4c92cbe24f9fc7e6232cc77800209170c61798cdb5ad9c0fc7369');
    expect(computeSyncContentHash('view_state', {
      active_node_id: 'node-1',
      device_id: 'device-1',
      form_factor: 'phone',
      key: 'active_node',
      platform: 'android',
      scope: 'session_resume'
    })).toBe('d3dc15e282a5142cc653d9c734d43ffb77c08ef3b7623a8b63873c59e5f3281b');
  });
});
