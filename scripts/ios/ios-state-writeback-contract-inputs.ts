import { computeCompanionContentHash } from '../../lib/core/database/companionHostStateHashes.ts';

const HOST_NAME = 'ios-acceptance-contract-peer';
const NODE_ID = 'ios-state-node';
const UPDATED_AT = '2026-07-21T00:01:00.000Z';

export function createIosStateWritebackContractInputs() {
  return [
    stateItem('node_reading', NODE_ID, {
      interval_duration_ms: 60_000, interval_growth_factor: 1.5,
      last_handled_at: UPDATED_AT, next_at: '2026-07-21T00:02:00.000Z',
      priority: 2, repetition_count: 3, state: 'active'
    }, 'workspace', 4),
    stateItem('node_review', NODE_ID, {
      difficulty: 5.2, due: '2026-07-28T00:01:00.000Z', elapsed_days: 3,
      lapses: 1, last_review_at: UPDATED_AT, reps: 4, scheduled_days: 7,
      stability: 8.5, state: 2
    }, 'workspace', 5),
    stateItem('setting', `host:ios:phone:${HOST_NAME}:handoff_reminder_settings`, {
      form_factor: 'phone', host_name: HOST_NAME, key: 'handoff_reminder_settings',
      platform: 'ios', scope: 'host', value_json: '{"enabled":true}'
    }, 'host', 6)
  ];
}

function stateItem(objectType: 'node_reading' | 'node_review' | 'setting', objectId: string,
  payload: Record<string, unknown>, scope: string, stateSeq: number) {
  return {
    authorHostName: HOST_NAME,
    base: { baseContentHash: null, kind: 'content_hash' as const },
    clientOpId: `${objectType}:${objectId}:${stateSeq}`,
    contentHash: computeCompanionContentHash(payload),
    deletedAt: null,
    identity: { objectId, objectType, scope },
    payloadJson: JSON.stringify(payload),
    updatedAt: UPDATED_AT
  };
}
