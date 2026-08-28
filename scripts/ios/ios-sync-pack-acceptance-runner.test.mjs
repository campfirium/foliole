// @vitest-environment node
import fs from 'node:fs';

import { expect, it } from 'vitest';

import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';
import {
  parseSyncPackSnapshot,
  verifySyncPackAcceptance
} from './ios-sync-pack-acceptance-runner.mjs';

it('accepts stable node, state, cursor, cleanup, and repeated apply evidence', () => {
  const snapshot = parseSyncPackSnapshot(JSON.stringify([{
    capture_current: 'acceptance-desktop#1', capture_versions: 2, confirmed_node_delivery_count: 2,
    cursor: '3', dirty_count: 0, push_ack_count: 0, restore_current: 'ios-device#restore',
    restore_deleted_at: null, restore_versions: 2, tombstone_count: 0
  }]));
  const gates = Object.fromEntries([
    'existing-highlight-edit', 'quick-capture', 'selection-annotation', 'topic-content-edit', 'trash-restore'
  ].map((key) => [key, false]));
  const first = {
    apply: { to_state_seq: 1 }, phase: 'applied',
    roundtrip: { gates, push: { pushedObjectIds: ['node:capture', 'node:restore'] } }
  };
  const second = { phase: 'reapplied', roundtrip: { gates, push: { pushedObjectIds: [] } } };
  const rejections = [
    'corrupt-envelope', 'wrong-target', 'cursor-gap', 'legacy-format', 'illegal-dag'
  ].map((rejection) => ({
    after: snapshot, before: snapshot, bridge: { phase: 'rejected', rejection }
  }));
  const observations = { registration: hostedProviderRegistrationEvidence(), sync_pack: {
    ack_statuses: ['accepted', 'accepted'], capture_node_id: 'capture',
    push_requests: 1, pushed_node_ids: ['capture', 'ios-acceptance-restore']
  } };

  expect(verifySyncPackAcceptance(first, second, snapshot, snapshot, rejections, observations)).toMatchObject({
    first_snapshot: { cache_entries: [], capture_versions: 2, cursor: 3, restore_versions: 2 },
    second_snapshot: { cache_entries: [], capture_versions: 2, cursor: 3, restore_versions: 2 }
  });
  expect(() => verifySyncPackAcceptance(
    first, second, snapshot, { ...snapshot, capture_versions: 3 }, rejections, observations
  )).toThrow('evidence is incomplete');
});

it('reads Sync Pack progress from the peer-scoped receive cursor', () => {
  const source = fs.readFileSync('scripts/ios/ios-sync-pack-acceptance-runner.mjs', 'utf8');
  expect(source).toContain('FROM sync_peer_cursors');
  expect(source).toContain("stream_name = 'sync-pack-receive'");
  expect(source).not.toContain("key = 'sync_pack_cursor'");
});
