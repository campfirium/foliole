import { ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS } from './androidCompanionLearningPayloadQueryDefinitions.js';
import {
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES,
  ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES
} from './androidCompanionMutationDefinitions.js';
import { ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS } from './androidCompanionPayloadQueryDefinitions.js';
import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from './androidCompanionSyncProtocolDefinitions.js';
import {
  ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS,
  ANDROID_COMPANION_SYNC_STREAM_READ_RULES
} from './androidCompanionSyncQueryDefinitions.js';

const mutations = ANDROID_COMPANION_MUTATION_DEFINITIONS;
const metaRules = ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES.companionMeta;
const ackRules = ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES.pushAck;
const protocol = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS;
const nodeVersionRules = ANDROID_COMPANION_SYNC_STREAM_READ_RULES.nodeVersions;
const sharedStateQuery = ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncStateChanges.sql;
const syncbackStateQuery = sharedStateQuery.replace(
  "object_type NOT IN ('node', 'view_state')",
  "object_type IN ('node_reading', 'node_review', 'setting')"
);

if (syncbackStateQuery === sharedStateQuery) {
  throw new Error('companion_syncback_state_query_contract_drift');
}

export const COMPANION_SYNCBACK_HOST_CONTRACT = {
  cursors: {
    nodeVersionPush: protocol.syncMetaCursors.nodeVersionPush,
    reviewLogPush: protocol.syncMetaCursors.reviewLogPush,
    statePush: protocol.syncMetaCursors.statePush
  },
  deviceIdMetaKey: 'device_id',
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
    ackDeleteIssues: mutations[ackRules.deleteIssuesMutationName],
    ackUpsert: mutations[ackRules.upsertMutationName],
    state: syncbackStateQuery,
    metaDelete: mutations[metaRules.deleteByKeyMutationName],
    metaQuery: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.companionMetaValue.sql,
    metaUpsert: mutations[metaRules.upsertMutationName],
    nodeVersionParent: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncNodeVersionParent.sql,
    nodeVersions: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncNodeVersions.sql,
    readingPayload: ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReading.sql,
    reviewLog: ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS.syncReviewLog.sql,
    reviewPayload: ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReview.sql,
    settingPayload: ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS.syncPayloadSetting.sql
  }
} as const;
