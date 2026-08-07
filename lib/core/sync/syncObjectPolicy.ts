export type SyncDeviceScope = 'cache' | 'device' | 'event' | 'workspace';
export type SyncPolicyCategory =
  | 'activity'
  | 'content'
  | 'diagnostic'
  | 'reading'
  | 'resource'
  | 'review'
  | 'settings'
  | 'structure'
  | 'ui_session';

export interface SyncObjectPolicy {
  category: SyncPolicyCategory;
  conflict: 'append_only_idempotent' | 'cache_refresh' | 'device_private' | 'lww' | 'review_merge';
  deviceScope: SyncDeviceScope;
  key: string;
  objectType: string | null;
  pushIssue: 'diagnostic' | 'review_required';
  storage: readonly string[];
  userVisible: boolean;
}

export const SYNC_OBJECT_POLICIES: readonly SyncObjectPolicy[] = [
  policy('node', 'node', 'structure', 'workspace', 'lww', ['nodes', 'node_order'], true),
  policy('node_order', 'node', 'structure', 'workspace', 'lww', ['node_order'], true),
  policy('external_document', 'external_document', 'structure', 'workspace', 'lww', ['external_documents'], true),
  policy('external_folder', 'external_folder', 'structure', 'workspace', 'lww', ['external_search_folders'], true),
  policy('import_source', 'import_source', 'structure', 'workspace', 'lww', ['import_sources'], true),
  policy('attachment', 'attachment', 'resource', 'workspace', 'lww', ['attachments', 'attachment_blobs'], true),
  policy('pdf_page_text', 'pdf_page_text', 'content', 'workspace', 'lww', ['pdf_page_text'], true),
  policy('content_blobs', null, 'resource', 'cache', 'cache_refresh', ['content_blobs', 'content_blob_data'], true, 'diagnostic'),
  policy(
    'node_open_state', 'node_open_state', 'activity', 'workspace', 'lww',
    ['node_open_state'], true, 'diagnostic'
  ),
  policy('node_reading', 'node_reading', 'reading', 'workspace', 'lww', ['node_reading'], true),
  policy('node_reading.reading_position', 'node_reading', 'reading', 'device', 'device_private', ['node_reading_device_state'], true, 'diagnostic'),
  policy('node_reading_device_state', null, 'reading', 'device', 'device_private', ['node_reading_device_state'], true, 'diagnostic'),
  policy('node_review', 'node_review', 'review', 'workspace', 'review_merge', ['node_review'], true),
  policy('node_text_alternative', 'node_text_alternative', 'content', 'workspace', 'lww', ['node_text_alternatives'], true),
  policy('review_log', null, 'review', 'event', 'append_only_idempotent', ['review_log'], true),
  policy('setting.workspace', 'setting', 'settings', 'workspace', 'lww', ['setting_records'], true),
  policy('setting.device', 'setting', 'settings', 'device', 'device_private', ['setting_records'], true, 'diagnostic'),
  policy('view_state.active_node', 'view_state', 'ui_session', 'device', 'device_private', ['workspace_meta'], true, 'diagnostic'),
  policy('view_state.node', 'view_state', 'ui_session', 'device', 'device_private', ['node_view_state'], true, 'diagnostic'),
  policy('node_view_state', null, 'ui_session', 'device', 'device_private', ['node_view_state'], true, 'diagnostic'),
  policy('sync_push_ack', null, 'diagnostic', 'device', 'device_private', ['sync_push_ack'], false, 'diagnostic')
];

export const SYNC_POLICY_DEVICE_PRIVATE_OBJECT_TYPES = uniqueObjectTypes(
  SYNC_OBJECT_POLICIES.filter((item) => item.deviceScope === 'device')
);

export const SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES = uniqueObjectTypes(
  SYNC_OBJECT_POLICIES.filter((item) => item.pushIssue === 'review_required')
);

export function isReviewRequiredPushIssueObjectType(objectType: string) {
  return SYNC_POLICY_REVIEW_REQUIRED_PUSH_ISSUE_TYPES.includes(objectType);
}

export function isBlockingAckForDirtyRetry(input: { object_type: string; status: string }) {
  return input.status === 'accepted' || input.status === 'already_applied' || isReviewRequiredPushIssueObjectType(input.object_type);
}

export function syncPolicySqlInList(values: readonly string[]) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
}

function policy(
  key: string,
  objectType: string | null,
  category: SyncPolicyCategory,
  deviceScope: SyncDeviceScope,
  conflict: SyncObjectPolicy['conflict'],
  storage: readonly string[],
  userVisible: boolean,
  pushIssue: SyncObjectPolicy['pushIssue'] = 'review_required'
): SyncObjectPolicy {
  return { category, conflict, deviceScope, key, objectType, pushIssue, storage, userVisible };
}

function uniqueObjectTypes(items: readonly SyncObjectPolicy[]) {
  return [...new Set(items.map((item) => item.objectType).filter((value): value is string => value !== null))].sort();
}
