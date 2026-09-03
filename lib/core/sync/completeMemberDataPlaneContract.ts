import {
  COMPLETE_MEMBER_DATA_PLANE_CAPABILITY,
  PREPARED_COMPLETE_MEMBER_PROTOCOL_DESCRIPTOR
} from '../../platform/syncProtocolContract.js';

export const COMPLETE_MEMBER_SHARED_POLICY_KEYS = [
  'attachment',
  'content_blobs',
  'external_document',
  'external_folder',
  'import_source',
  'node',
  'node_open_state',
  'node_order',
  'node_reading',
  'node_review',
  'node_text_alternative',
  'pdf_page_text',
  'review_log',
  'setting.workspace',
  'watched_folder'
] as const;

export const COMPLETE_MEMBER_PRIVATE_POLICY_KEYS = [
  'node_reading.reading_position',
  'node_reading_host_state',
  'node_view_state',
  'setting.host',
  'sync_delivery_receipts',
  'view_state.active_node',
  'view_state.node'
] as const;

export const COMPLETE_MEMBER_DERIVED_INDEXES = [
  'external_search_fts',
  'node_search',
  'pdf_search',
  'search_index_invalidations'
] as const;

export const COMPLETE_MEMBER_RESOURCE_KINDS = [
  'attachment',
  'content_blob'
] as const;

export const COMPLETE_MEMBER_DATA_PLANE_CONTRACT = Object.freeze({
  capability: COMPLETE_MEMBER_DATA_PLANE_CAPABILITY,
  derivedIndexes: COMPLETE_MEMBER_DERIVED_INDEXES,
  lifecycle: Object.freeze(['delete', 'restore']),
  privatePolicyKeys: COMPLETE_MEMBER_PRIVATE_POLICY_KEYS,
  protocol: PREPARED_COMPLETE_MEMBER_PROTOCOL_DESCRIPTOR,
  resourceKinds: COMPLETE_MEMBER_RESOURCE_KINDS,
  sharedPolicyKeys: COMPLETE_MEMBER_SHARED_POLICY_KEYS,
  session: Object.freeze({
    directions: Object.freeze(['push', 'pull']),
    idempotentApply: true,
    peerScopedCursor: true,
    peerScopedReceipt: true,
    resourceIntegrity: 'sha256'
  })
});
