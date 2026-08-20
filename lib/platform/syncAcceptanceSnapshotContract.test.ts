import { expect, it } from 'vitest';

import {
  parseSyncAcceptanceSnapshot,
  projectSyncAcceptanceSnapshot
} from './syncAcceptanceSnapshotContract.js';
import { syncAcceptanceFactsFixture } from './syncAcceptanceSnapshotFixtures.js';

const HOSTS = ['android', 'desktop'] as const;
const BASELINES = ['fresh_join', 'existing_sync', 'rejoin'] as const;

it.each(BASELINES)('projects %s to the same unique baseline on Android and desktop', (baseline) => {
  for (const host of HOSTS) {
    const snapshot = projectSyncAcceptanceSnapshot(syncAcceptanceFactsFixture(baseline, host));
    expect(snapshot.journey_baseline).toBe(baseline);
    expect(parseSyncAcceptanceSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual({
      ok: true,
      value: snapshot
    });
  }
});

it('keeps masked identity and group references across generated JSON', () => {
  const snapshot = projectSyncAcceptanceSnapshot(
    syncAcceptanceFactsFixture('existing_sync', 'android')
  );
  const generated = JSON.stringify(snapshot);
  expect(generated).toContain('sha256:');
  expect(generated).not.toMatch(/database_path|"device_id":|private_key|raw_secret|workgroup_key/u);
});

it('rejects an unknown version before acceptance', () => {
  const snapshot = projectSyncAcceptanceSnapshot(
    syncAcceptanceFactsFixture('fresh_join', 'desktop')
  );
  expect(parseSyncAcceptanceSnapshot({ ...snapshot, schema_version: 2 })).toEqual({
    ok: false,
    reason: 'unknown_version'
  });
});

it('rejects missing required fields', () => {
  const snapshot = projectSyncAcceptanceSnapshot(
    syncAcceptanceFactsFixture('existing_sync', 'android')
  );
  const missingGroup: Partial<typeof snapshot> = { ...snapshot };
  delete missingGroup.group;
  expect(parseSyncAcceptanceSnapshot(missingGroup)).toEqual({
    ok: false,
    reason: 'missing_or_invalid_field'
  });
});

it('rejects fields outside the frozen v1 envelope', () => {
  const snapshot = projectSyncAcceptanceSnapshot(
    syncAcceptanceFactsFixture('fresh_join', 'android')
  );
  expect(parseSyncAcceptanceSnapshot({ ...snapshot, controller_hint: 'existing_sync' })).toEqual({
    ok: false,
    reason: 'missing_or_invalid_field'
  });
});

it('rejects a baseline that conflicts with the product facts', () => {
  const snapshot = projectSyncAcceptanceSnapshot(syncAcceptanceFactsFixture('rejoin', 'desktop'));
  expect(parseSyncAcceptanceSnapshot({ ...snapshot, journey_baseline: 'existing_sync' })).toEqual({
    ok: false,
    reason: 'baseline_conflict'
  });
});

it('rejects unknown product state as unsupported instead of inferring a journey', () => {
  const snapshot = projectSyncAcceptanceSnapshot(syncAcceptanceFactsFixture('unknown', 'android'));
  expect(snapshot.journey_baseline).toBe('unsupported');
  expect(parseSyncAcceptanceSnapshot(snapshot)).toEqual({
    ok: false,
    reason: 'unsupported_baseline'
  });
});

it.each(['credential_value', 'device_id', 'raw_secret', 'workgroup_key', 'private_key'])(
  'rejects leaked %s fields',
  (field) => {
    const snapshot = projectSyncAcceptanceSnapshot(
      syncAcceptanceFactsFixture('existing_sync', 'desktop')
    );
    expect(parseSyncAcceptanceSnapshot({ ...snapshot, [field]: 'leaked-value' })).toEqual({
      ok: false,
      reason: 'secret_field'
    });
  }
);
