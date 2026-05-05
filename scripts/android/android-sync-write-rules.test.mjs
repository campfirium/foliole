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
const SYNC_WRITE_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncWriteRules.java');
const SYNC_STATE_WRITE_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncStateWriteStore.java'
);
const VIEW_STATE_SYNC_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionViewStateSyncStore.java'
);

describe('Android sync write metadata', () => {
  it('generates sync write result, record, and canonical keys', async () => {
    const definitions = JSON.parse(await readFile(SYNC_PROTOCOL_DEFINITIONS, 'utf8'));

    expect(definitions.syncWrite).toEqual(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncWrite);
    expect(definitions.syncWrite).toMatchObject({
      recordKeys: {
        objectId: 'object_id',
        payloadJson: 'payload_json'
      },
      resultKeys: {
        contentHash: 'content_hash',
        objectId: 'object_id',
        opId: 'op_id'
      },
      viewCanonicalKeys: {
        deviceId: 'device_id',
        scope: 'scope'
      }
    });
  });

  it('keeps Android sync write stores wired to generated sync write keys', async () => {
    const combinedSource = [
      await readFile(SYNC_STATE_WRITE_STORE, 'utf8'),
      await readFile(VIEW_STATE_SYNC_STORE, 'utf8')
    ].join('\n');
    const rulesSource = await readFile(SYNC_WRITE_RULES, 'utf8');

    expect(rulesSource).toContain('getJSONObject("syncWrite")');
    expect(combinedSource).toContain('FolioleCompanionSyncWriteRules.recordKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionSyncWriteRules.resultKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionSyncWriteRules.viewCanonicalKey(context, key)');
    expect(combinedSource).not.toContain('result.put("object_id"');
    expect(combinedSource).not.toContain('result.put("content_hash"');
    expect(combinedSource).not.toContain('result.put("op_id"');
    expect(combinedSource).not.toContain('record.put("object_id"');
    expect(combinedSource).not.toContain('record.put("payload_json"');
    expect(combinedSource).not.toContain('canonical.put("device_id"');
    expect(combinedSource).not.toContain('canonical.put("scope"');
  });
});
