// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';

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
const SYNC_PUSH_ACK_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncPushAckStore.java'
);
const SYNC_STATE_WRITE_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncStateWriteStore.java'
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
const SYNC_META_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncMetaStore.java'
);
const META_RECORDS = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionMetaRecords.java');
const SYNC_DIAGNOSTIC_VERDICTS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncDiagnosticVerdicts.java'
);
const SYNC_STATE_PLUGIN_ACTIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncStatePluginActions.java'
);
const SYNC_DATA_PLUGIN_ACTIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncDataPluginActions.java'
);

describe('Android sync push ack protocol rules', () => {
  it('loads push ack protocol rules from generated definitions', async () => {
    const definitions = JSON.parse(await readFile(SYNC_PROTOCOL_DEFINITIONS, 'utf8'));
    const source = await readFile(SYNC_PUSH_ACK_STORE, 'utf8');

    expect(definitions).toEqual(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS);
    expect(definitions.pushAck).toMatchObject({
      clientOpIdKeys: ['client_op_id', 'clientOpId'],
      identityKey: 'identity',
      identityObjectIdKey: 'objectId',
      identityObjectTypeKey: 'objectType',
      resultSavedClientOpIdsKey: 'saved_client_op_ids',
      stateSeqKey: 'state_seq',
      statusKey: 'status'
    });
    expect(source).toContain('FolioleCompanionSyncPushAckRules.load(context)');
    expect(source).toContain('rules.resultSavedClientOpIdsKey()');
    expect(source).not.toContain('"saved_client_op_ids"');
    expect(source).not.toContain('"client_op_id"');
    expect(source).not.toContain('"clientOpId"');
    expect(source).not.toContain('"identity"');
    expect(source).not.toContain('"state_seq"');
    expect(source).not.toContain('status.equals("accepted")');
    expect(source).not.toContain('objectType.equals("review_log")');
  });

  it('loads sync object type names from generated definitions', async () => {
    const stateWriteSource = await readFile(SYNC_STATE_WRITE_STORE, 'utf8');
    const viewStateSource = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');

    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncObjectTypes).toEqual({
      nodeReading: 'node_reading',
      nodeReview: 'node_review',
      settingRecord: 'setting',
      viewState: 'view_state'
    });
    expect(stateWriteSource).toContain('FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, key)');
    expect(viewStateSource).toContain('FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, "viewState")');
    expect(stateWriteSource).not.toContain('"node_reading"');
    expect(stateWriteSource).not.toContain('"node_review"');
    expect(stateWriteSource).not.toContain('"setting"');
    expect(viewStateSource).not.toContain('"view_state"');
  });

  it('loads sync meta status sets from generated definitions', async () => {
    const source = await readFile(SYNC_META_STORE, 'utf8');

    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncEvents.statuses).toEqual([
      'started',
      'completed',
      'failed',
      'skipped'
    ]);
    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncOnboarding.statuses).toEqual([
      'accepted',
      'completed',
      'dismissed',
      'pending'
    ]);
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringSet(context, "syncEvents", "statuses")');
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringSet(context, "syncOnboarding", "statuses")');
    expect(source).not.toContain('normalized.equals("started")');
    expect(source).not.toContain('normalized.equals("accepted")');
  });

  it('loads sync diagnostic status checks from generated definitions', async () => {
    const source = await readFile(SYNC_DIAGNOSTIC_VERDICTS, 'utf8');

    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "completedStatus")');
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "fallbackStatus")');
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "skippedStatus")');
    expect(source).not.toContain('"completed".equals(event.optString("status"))');
    expect(source).not.toContain('"failed".equals(status)');
    expect(source).not.toContain('"skipped".equals(status)');
  });

  it('loads sync cursor meta keys from generated definitions', async () => {
    const source = await readFile(SYNC_STATE_PLUGIN_ACTIONS, 'utf8');

    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaCursors).toEqual({
      nodeVersion: 'sync_node_version_cursor',
      nodeVersionPush: 'sync_node_version_push_cursor',
      pack: 'sync_pack_cursor',
      reviewLog: 'sync_review_log_cursor',
      reviewLogPush: 'sync_review_log_push_cursor',
      state: 'sync_state_cursor',
      statePush: 'sync_state_push_cursor'
    });
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(databaseHelper.hostContext(), "syncMetaCursors", key)');
    expect(source).not.toContain('SYNC_REVIEW_LOG_CURSOR_KEY');
    expect(source).not.toContain('"sync_review_log_cursor"');
  });

  it('loads sync plugin request keys from generated definitions', async () => {
    const source = [
      await readFile(SYNC_STATE_PLUGIN_ACTIONS, 'utf8'),
      await readFile(SYNC_DATA_PLUGIN_ACTIONS, 'utf8')
    ].join('\n');

    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncPluginRequestKeys).toMatchObject({
      acks: 'acks',
      cursor: 'cursor',
      objectIds: 'object_ids',
      objectTypes: 'object_types'
    });
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(databaseHelper.hostContext(), "syncPluginRequestKeys", key)');
    expect(source).not.toContain('optJSONArray("acks"');
    expect(source).not.toContain('optJSONArray("object_ids"');
    expect(source).not.toContain('optJSONObject("cursor"');
    expect(source).not.toContain('getInt("cursor"');
  });

  it('loads sync cursor payload keys from generated definitions', async () => {
    const source = await readFile(META_RECORDS, 'utf8');

    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncCursorPayloadKeys).toMatchObject({
      changeId: 'change_id',
      createdAt: 'created_at',
      cursor: 'cursor'
    });
    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncCursorPayloadKeys", key)');
    expect(source).not.toContain('result.put("cursor"');
    expect(source).not.toContain('cursor.isNull("created_at"');
    expect(source).not.toContain('cursor.getString("change_id"');
  });
});
