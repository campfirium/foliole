import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import type { NativeWorkspaceReviewProfile } from '../../lib/platform/nativeStorageContract.js';
import type {
  NativeSyncNodeRecord,
  NativeSyncStateObjectRecord
} from '../../lib/platform/nativeSyncContract.js';

import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';

export const ANDROID_SOURCE_DEVICE_ID = 'android-device';
export const ARTICLE_PARENT_ID = 'article-parent';
export const CAPTURE_NODE_ID = 'node-capture';
export const CLOZE_NODE_ID = 'node-cloze';
export const NOTE_NODE_ID = 'node-note';
export const EXPECTED_VERSION_IDS = [
  'android-device#00000000-0000-4000-8000-000000000101',
  'android-device#00000000-0000-4000-8000-000000000102',
  'android-device#00000000-0000-4000-8000-000000000103'
] as const;

const CREATED_AT = '2026-05-21T08:00:00.000Z';

export const CLOZE_REVIEW: NativeWorkspaceReviewProfile = {
  difficulty: 0,
  due: '2026-05-22T20:00:00.000Z',
  elapsedDays: 0,
  lapses: 0,
  lastReviewAt: null,
  reps: 0,
  scheduledDays: 0,
  stability: 0,
  state: 0
};

function baseNode(input: Pick<WorkspaceNodeSnapshot, 'anchorLink' | 'content' | 'id' | 'kind' | 'parentNodeId' | 'reveal' | 'title'>): WorkspaceNodeSnapshot {
  return {
    ...input,
    createdAt: CREATED_AT,
    hideTitleHeading: false,
    isTitleManual: false,
    openingText: null,
    reading: null,
    review: input.id === CLOZE_NODE_ID ? CLOZE_REVIEW : null,
    updatedAt: CREATED_AT
  };
}

function captureNode() {
  return baseNode({
    anchorLink: null,
    content: 'Quick note\nsecond line',
    id: CAPTURE_NODE_ID,
    kind: 'topic',
    parentNodeId: 'special-inbox',
    reveal: null,
    title: 'Quick note'
  });
}

function clozeNode() {
  return baseNode({
    anchorLink: {
      id: 'anchor-1',
      kind: 'cloze',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Alpha [...] Gamma',
    id: CLOZE_NODE_ID,
    kind: 'item',
    parentNodeId: ARTICLE_PARENT_ID,
    reveal: 'Beta',
    title: 'Alpha [...] Gamma — Beta'
  });
}

function noteNode() {
  return baseNode({
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Beta\n※ Remember this',
    id: NOTE_NODE_ID,
    kind: 'topic',
    parentNodeId: ARTICLE_PARENT_ID,
    reveal: null,
    title: 'Beta'
  });
}

function reviewPayload() {
  return {
    difficulty: CLOZE_REVIEW.difficulty,
    due: CLOZE_REVIEW.due,
    elapsed_days: CLOZE_REVIEW.elapsedDays,
    lapses: CLOZE_REVIEW.lapses,
    last_review_at: CLOZE_REVIEW.lastReviewAt,
    node_id: CLOZE_NODE_ID,
    reps: CLOZE_REVIEW.reps,
    scheduled_days: CLOZE_REVIEW.scheduledDays,
    stability: CLOZE_REVIEW.stability,
    state: CLOZE_REVIEW.state
  };
}

function nodePushPayload(record: NativeSyncNodeRecord): CompanionSyncPushPayload {
  return {
    base: {
      ancestorVersionIds: record.ancestor_version_ids,
      kind: 'node_version',
      parentVersionId: record.parent_version_id,
      ...(record.parent_version_ids ? { parentVersionIds: record.parent_version_ids } : {})
    },
    clientOpId: `node:${record.version_id}`,
    ...(record.content_hash ? { contentHash: record.content_hash } : {}),
    identity: { objectId: record.object_id, objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record),
    updatedAt: record.updated_at
  };
}

function reviewRecord(): NativeSyncStateObjectRecord & { base_content_hash: null } {
  const payload = reviewPayload();
  return {
    base_content_hash: null,
    content_hash: computeSyncContentHash('node_review', payload),
    deleted_at: null,
    object_id: CLOZE_NODE_ID,
    object_type: 'node_review',
    payload_json: JSON.stringify(payload),
    state_seq: 1,
    updated_at: CREATED_AT
  };
}

function reviewPushPayload(record: ReturnType<typeof reviewRecord>): CompanionSyncPushPayload {
  return {
    base: { baseContentHash: record.base_content_hash, kind: 'content_hash' },
    clientOpId: `${record.object_type}:${record.object_id}:${record.state_seq}`,
    contentHash: record.content_hash,
    deletedAt: record.deleted_at,
    identity: { objectId: record.object_id, objectType: record.object_type, scope: 'workspace' },
    payloadJson: record.payload_json,
    updatedAt: record.updated_at
  };
}

export async function buildAndroidCaptureAnnotationPushPayloads() {
  const versions = [];
  for (const node of [captureNode(), clozeNode(), noteNode()]) {
    versions.push(await toWorkspaceNativeNodeVersion(node, ANDROID_SOURCE_DEVICE_ID));
  }
  return [
    ...versions.map(nodePushPayload),
    reviewPushPayload(reviewRecord())
  ];
}
