import { ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS } from './androidCompanionLearningPayloadQueryDefinitions.js';
import {
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES,
  ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES
} from './androidCompanionMutationDefinitions.js';
import {
  ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS
} from './androidCompanionSyncProtocolDefinitions.js';
import {
  ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS,
  ANDROID_COMPANION_SYNC_STREAM_READ_RULES
} from './androidCompanionSyncQueryDefinitions.js';

const mutations = ANDROID_COMPANION_MUTATION_DEFINITIONS;
const metaRules = ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES.companionMeta;
const ackRules = ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES.pushAck;
const protocol = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS;
const sharedStateQuery = ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncStateChanges.sql;
const reviewStateQuery = sharedStateQuery.replace(
  "object_type NOT IN ('node', 'view_state')",
  "object_type = 'node_review'"
);

if (reviewStateQuery === sharedStateQuery) {
  throw new Error('companion_review_syncback_state_query_contract_drift');
}

export const COMPANION_REVIEW_SYNCBACK_HOST_CONTRACT = {
  cursors: {
    reviewLogPush: protocol.syncMetaCursors.reviewLogPush,
    statePush: protocol.syncMetaCursors.statePush
  },
  deviceIdMetaKey: 'device_id',
  limits: {
    default: ANDROID_COMPANION_SYNC_STREAM_READ_RULES.reviewLog.defaultLimit,
    max: ANDROID_COMPANION_SYNC_STREAM_READ_RULES.reviewLog.maxLimit,
    min: ANDROID_COMPANION_SYNC_STREAM_READ_RULES.reviewLog.minLimit
  },
  pushAck: protocol.pushAck,
  sql: {
    ackDeleteIssues: mutations[ackRules.deleteIssuesMutationName],
    ackUpsert: mutations[ackRules.upsertMutationName],
    metaDelete: mutations[metaRules.deleteByKeyMutationName],
    metaQuery: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.companionMetaValue.sql,
    metaUpsert: mutations[metaRules.upsertMutationName],
    reviewLog: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncReviewLog.sql,
    reviewPayload: ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReview.sql,
    reviewState: reviewStateQuery
  }
} as const;
