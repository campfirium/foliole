import { ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS } from './androidCompanionLearningPayloadQueryDefinitions.js';
import {
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES
} from './androidCompanionMutationDefinitions.js';
import { ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS } from './androidCompanionPayloadQueryDefinitions.js';
import { REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL } from './androidCompanionSyncPolicySql.js';
import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from './androidCompanionSyncProtocolDefinitions.js';
import {
  ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS,
  ANDROID_COMPANION_SYNC_STREAM_READ_RULES
} from './androidCompanionSyncQueryDefinitions.js';

const mutations = ANDROID_COMPANION_MUTATION_DEFINITIONS;
const metaRules = ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES.companionMeta;
const protocol = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS;
const nodeVersionRules = ANDROID_COMPANION_SYNC_STREAM_READ_RULES.nodeVersions;
const sharedStateQuery = ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncStateChanges.sql;
const reviewRequiredReceipt = `receipt.object_type IN (${REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL})`;
const syncbackStateQuery = sharedStateQuery.replace(
  "object_type NOT IN ('node', 'view_state')",
  "object_type IN ('node_open_state', 'node_reading', 'node_review', 'node_text_alternative', 'setting')"
).replace('AND state_seq > ? ', 'AND ? >= 0 ').replace(
  reviewRequiredReceipt,
  `${reviewRequiredReceipt} AND NOT (sync_object_state.object_type = 'node_text_alternative' `
    + 'AND sync_object_state.deleted_at IS NOT NULL)'
);

if (syncbackStateQuery === sharedStateQuery || syncbackStateQuery.includes('AND state_seq > ? ')
    || !syncbackStateQuery.includes('sync_object_state.deleted_at IS NOT NULL')) {
  throw new Error('companion_syncback_state_query_contract_drift');
}

export const COMPANION_SYNCBACK_HOST_CONTRACT = {
  cursors: {
    nodeVersionPush: protocol.syncMetaCursors.nodeVersionPush,
    reviewLogPush: protocol.syncMetaCursors.reviewLogPush,
    statePush: protocol.syncMetaCursors.statePush
  },
  hostNameMetaKey: 'host_name',
  limits: {
    default: ANDROID_COMPANION_SYNC_STREAM_READ_RULES.reviewLog.defaultLimit,
    max: ANDROID_COMPANION_SYNC_STREAM_READ_RULES.reviewLog.maxLimit,
    min: ANDROID_COMPANION_SYNC_STREAM_READ_RULES.reviewLog.minLimit
  },
  nodeVersions: {
    ancestorDepthLimit: nodeVersionRules.ancestorDepthLimit,
    defaultLimit: nodeVersionRules.defaultLimit,
    maxLimit: nodeVersionRules.maxLimit,
    minLimit: nodeVersionRules.minLimit
  },
  pushAck: protocol.pushAck,
  sql: {
    alternativeNodeDeletion: `SELECT node.deleted_at FROM node_text_alternatives alternative
      JOIN nodes node ON node.id = alternative.node_id WHERE alternative.alternative_id = ?`,
    state: syncbackStateQuery,
    metaDelete: mutations[metaRules.deleteByKeyMutationName],
    metaQuery: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.companionMetaValue.sql,
    metaUpsert: mutations[metaRules.upsertMutationName],
    nodeVersionParent: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncNodeVersionParent.sql,
    nodeVersions: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncNodeVersions.sql,
    openStatePayload: ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeOpenState.sql,
    alternativePayload: ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeTextAlternative.sql,
    readingPayload: ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReading.sql,
    reviewLog: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncReviewLog.sql,
    reviewPayload: ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReview.sql,
    settingPayload: ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS.syncPayloadSetting.sql
  }
} as const;
