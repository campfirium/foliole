// @vitest-environment node
import { expect, it } from 'vitest';

import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';
import { parseSyncPackSnapshot, verifySyncPackAcceptance } from './ios-sync-pack-acceptance-runner.mjs';

const version = suffix => `ver_00000000-0000-4000-8000-000000000${suffix}`;
function evidence() {
  const snapshot = parseSyncPackSnapshot(JSON.stringify([{
    capture_current: version('148'), capture_versions: 2, capture_body: 'Mac successor body', capture_parent: version('146'),
    restore_current: version('147'), restore_body: 'Restore body', restore_parent: version('145'),
    restore_deleted_at: null, restore_versions: 2, tombstone_count: 0
  }]));
  const gates = Object.fromEntries([
    'existing-highlight-edit', 'quick-capture', 'selection-annotation', 'topic-content-edit', 'trash-restore'
  ].map(key => [key, true]));
  const first = { apply: { remainingStructureChangeCount: 0 }, phase: 'applied',
    roundtrip: { gates, push: { pushedObjectIds: ['capture', 'ios-acceptance-restore'] } } };
  const second = { phase: 'reapplied', roundtrip: { gates, push: { pushedObjectIds: [] } } };
  const observations = { registration: hostedProviderRegistrationEvidence(), sync_pack: {
    capture_node_id: 'capture', received_version_ids: [version('146'), version('147')], successor_version_id: version('148')
  } };
  return { snapshot, first, second, observations };
}

it('accepts persisted capture, restore, parent history and unchanged restart results', () => {
  const { first, second, snapshot, observations } = evidence();
  expect(verifySyncPackAcceptance(first, second, snapshot, snapshot, observations))
    .toMatchObject({ first_snapshot: snapshot, second_snapshot: snapshot });
});
it.each(['capture_body', 'capture_parent', 'restore_body', 'restore_parent', 'capture_current', 'restore_current'])(
  'rejects changed %s even when both snapshots have the same counts', field => {
    const { first, second, snapshot, observations } = evidence();
    const corrupt = { ...snapshot, [field]: 'incorrect' };
    expect(() => verifySyncPackAcceptance(first, second, corrupt, corrupt, observations)).toThrow('evidence is incomplete');
  });
it('rejects missing provider persistence and changed restart state', () => {
  const { first, second, snapshot, observations } = evidence();
  expect(() => verifySyncPackAcceptance(first, second, snapshot, snapshot, {})).toThrow('evidence is incomplete');
  expect(() => verifySyncPackAcceptance(first, second, snapshot, { ...snapshot, capture_versions: 3 }, observations))
    .toThrow('evidence is incomplete');
});
