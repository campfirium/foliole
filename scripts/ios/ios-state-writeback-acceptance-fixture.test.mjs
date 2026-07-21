import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createIosStateWritebackAcceptanceFixture } from './ios-state-writeback-acceptance-fixture.ts';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
});

function stateItem(objectType, objectId, payloadJson, contentHash) {
  return {
    base: { baseContentHash: null, kind: 'content_hash' },
    clientOpId: `${objectType}:${objectId}:1`,
    contentHash,
    deletedAt: null,
    identity: {
      objectId,
      objectType,
      scope: objectType === 'setting' ? 'device' : objectType === 'view_state' ? 'session_resume' : 'workspace'
    },
    payloadJson: JSON.stringify(payloadJson),
    updatedAt: '2026-07-21T00:01:00.000Z'
  };
}

function acceptanceItems() {
  const reviewLog = {
    device_id: 'ios-device',
    due_after: '2026-07-23T00:00:00.000Z', due_before: '2026-07-21T00:00:00.000Z',
    grade: 3, id: 'ios-review-log', node_id: 'ios-state-node', op_id: 'ios-review-op',
    reviewed_at: '2026-07-21T00:01:00.000Z', scheduler_version: 'ts-fsrs@4',
    stability_after: 4.2, stability_before: 3.2, difficulty_after: 3.2, difficulty_before: 3.1
  };
  return [
    stateItem('node_reading', 'ios-state-node', {
      interval_duration_ms: 120000, interval_growth_factor: 1.5,
      last_handled_at: '2026-07-21T00:01:00.000Z', next_at: '2026-07-22T00:00:00.000Z',
      priority: 3, repetition_count: 2, state: 'active'
    }, 'reading-hash'),
    stateItem('node_review', 'ios-state-node', {
      difficulty: 3.2, due: '2026-07-23T00:00:00.000Z', elapsed_days: 1,
      lapses: 0, last_review_at: '2026-07-21T00:01:00.000Z', reps: 2,
      scheduled_days: 2, stability: 4.2, state: 2
    }, 'review-hash'),
    {
      base: { kind: 'op_id', opId: reviewLog.op_id },
      clientOpId: `review_log:${reviewLog.op_id}`,
      identity: { objectId: reviewLog.op_id, objectType: 'review_log', scope: 'workspace' },
      payloadJson: JSON.stringify(reviewLog)
    },
    stateItem('setting', 'device:ios:phone:*:handoff_reminder_settings', {
      device_id: '*', form_factor: 'phone', key: 'handoff_reminder_settings',
      platform: 'ios', scope: 'device', value_json: '{"enabled":true}'
    }, 'setting-hash')
  ];
}

describe('iOS state writeback acceptance fixture', () => {
  it('applies shared state through the formal DbPort contract and builds a confirmation pack', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-state-writeback-'));
    const fixture = await createIosStateWritebackAcceptanceFixture({ outputDirectory: tempRoot, toPeerId: 'ios-device' });
    try {
      const first = await fixture.apply(acceptanceItems());
      const second = await fixture.apply(acceptanceItems());
      const packPath = await fixture.buildConfirmationPack();

      expect(first.acks.map((ack) => ack.status)).toEqual(['accepted', 'accepted', 'accepted', 'accepted']);
      expect(first.appliedObjectIds).toEqual([
        'node_reading:ios-state-node', 'node_review:ios-state-node',
        'setting:device:ios:phone:*:handoff_reminder_settings'
      ]);
      expect(first.appliedReviewOpIds).toEqual(['ios-review-op']);
      expect(second.acks.map((ack) => ack.status)).toEqual([
        'already_applied', 'already_applied', 'already_applied', 'already_applied'
      ]);
      await expect(fs.stat(packPath)).resolves.toMatchObject({ size: expect.any(Number) });
    } finally {
      fixture.close();
    }
  });

  it('keeps device-private view state out of desktop state', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-view-state-'));
    const fixture = await createIosStateWritebackAcceptanceFixture({ outputDirectory: tempRoot, toPeerId: 'ios-device' });
    try {
      const result = await fixture.apply([
        stateItem('view_state', 'session_resume:ios:phone:ios-device:active_node', { active_node_id: 'ios-state-node' }, 'view-hash')
      ]);
      expect(result.acks).toMatchObject([{ conflictReason: 'device_private_view_state_push', status: 'rejected' }]);
      expect(fixture.driver.queryOne(
        "SELECT object_id FROM sync_object_state WHERE object_type = 'view_state'"
      )).toBeUndefined();
    } finally {
      fixture.close();
    }
  });
});
