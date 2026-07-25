// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYNC_STATE_WRITE_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncStateWriteStore.java'
);
const VIEW_STATE_SYNC_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionViewStateSyncStore.java'
);

describe('Android sync object type protocol rules', () => {
  it('loads sync object type names from generated definitions', async () => {
    const stateWriteSource = await readFile(SYNC_STATE_WRITE_STORE, 'utf8');
    const viewStateSource = await readFile(VIEW_STATE_SYNC_STORE, 'utf8');

    expect(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncObjectTypes).toEqual({
      nodeOpenState: 'node_open_state',
      nodeReading: 'node_reading',
      nodeReview: 'node_review',
      nodeTextAlternative: 'node_text_alternative',
      settingRecord: 'setting',
      viewState: 'view_state'
    });
    expect(stateWriteSource).toContain('FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, key)');
    expect(viewStateSource).not.toContain('FolioleCompanionSyncProtocolDefinitions.syncObjectType');
    expect(stateWriteSource).not.toContain('"node_reading"');
    expect(stateWriteSource).not.toContain('"node_open_state"');
    expect(stateWriteSource).not.toContain('"node_review"');
    expect(stateWriteSource).not.toContain('"setting"');
    expect(viewStateSource).not.toContain('"view_state"');
  });
});
