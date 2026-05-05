// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const STATE_WRITE_STORE = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncStateWriteStore.java');
const LEARNING_PAYLOAD = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionLearningSyncPayload.java');
const LEARNING_RULES = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionLearningPayloadRules.java');

describe('Android learning sync payload metadata', () => {
  it('generates reading and review payload keys, defaults, and hash rules', async () => {
    const definitions = JSON.parse(await readFile(QUERY_DEFINITIONS, 'utf8'));

    expect(definitions.queries.syncPayloadNodeReading.syncPayload).toMatchObject({
      defaultDeviceId: '*',
      defaultIntervalDurationMs: 0,
      defaultIntervalGrowthFactor: 1,
      defaultReadingPosition: 0,
      defaultState: 'active',
      hashIgnoredPayloadKeys: ['device_id', 'reading_position'],
      inputPayloadKey: 'reading_json',
      nodeIdPayloadKey: 'node_id',
      readingPositionPayloadKey: 'reading_position'
    });
    expect(definitions.queries.syncPayloadNodeReview.syncPayload).toMatchObject({
      defaultDifficulty: 0,
      defaultLapses: 0,
      defaultStability: 0,
      inputPayloadKey: 'review_json',
      nodeIdPayloadKey: 'node_id',
      reviewLogInputPayloadKey: 'review_log_json'
    });
  });

  it('keeps Java learning sync writes wired to generated payload metadata', async () => {
    const stateWriteSource = await readFile(STATE_WRITE_STORE, 'utf8');
    const learningSource = await readFile(LEARNING_PAYLOAD, 'utf8');
    const rulesSource = await readFile(LEARNING_RULES, 'utf8');

    expect(stateWriteSource).toContain('FolioleCompanionLearningPayloadRules.inputPayload(context, input, queryName)');
    expect(stateWriteSource).toContain('FolioleCompanionLearningPayloadRules.readingHashPayload(context, payload)');
    expect(learningSource).toContain('FolioleCompanionLearningPayloadRules.longValue(context, payload, queryName');
    expect(learningSource).toContain('FolioleCompanionLearningPayloadRules.doubleValue(context, payload, queryName');
    expect(rulesSource).toContain('FolioleCompanionSyncPayloadQueryStore.metadataArrayText(context, queryName, key)');
    expect(stateWriteSource).not.toContain('hashPayload.remove("reading_position")');
    expect(learningSource).not.toContain('payload.optString("state", "active")');
    expect(learningSource).not.toContain('payload.optLong("reading_position", 0)');
  });
});
