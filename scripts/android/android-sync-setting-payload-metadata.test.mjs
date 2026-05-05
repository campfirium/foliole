// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const STATE_WRITE_STORE = path.join(
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
const SETTING_RULES = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncSettingPayloadRules.java'
);

describe('Android setting sync payload metadata', () => {
  it('generates setting payload identity keys and defaults with the payload query', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.queries.syncPayloadSetting.syncPayload).toMatchObject({
      defaultDeviceId: '*',
      defaultFormFactor: 'phone',
      defaultPlatform: 'android',
      defaultScope: 'device',
      defaultValueJson: 'null',
      deviceIdPayloadKey: 'device_id',
      formFactorPayloadKey: 'form_factor',
      keyPayloadKey: 'key',
      objectType: 'setting',
      platformPayloadKey: 'platform',
      scopePayloadKey: 'scope',
      valueJsonPayloadKey: 'value_json'
    });
  });

  it('keeps Android setting writes wired to generated setting payload metadata', async () => {
    const stateWriteSource = await readFile(STATE_WRITE_STORE, 'utf8');
    const settingRulesSource = await readFile(SETTING_RULES, 'utf8');

    expect(stateWriteSource).toContain('FolioleCompanionSyncSettingPayloadRules.key(context, input)');
    expect(stateWriteSource).toContain('FolioleCompanionSyncSettingPayloadRules.payload(context');
    expect(settingRulesSource).toContain('FolioleCompanionSyncPayloadQueryStore.SETTING_PAYLOAD_QUERY_NAME');
    expect(settingRulesSource).toContain('FolioleCompanionSyncPayloadQueryStore.scopedObjectId');
    expect(stateWriteSource).not.toContain('input.optString("scope", "device")');
    expect(stateWriteSource).not.toContain('scope + ":" + platform');
    expect(stateWriteSource).not.toContain('payload.put("value_json", valueJson)');
  });
});
