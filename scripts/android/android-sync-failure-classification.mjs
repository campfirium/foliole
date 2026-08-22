const PUBLIC_ROUTES = new Set([
  '/companion/attachment-resource', '/companion/content-blob', '/companion/content-blobs',
  '/companion/sync-index', '/companion/sync-node-versions', '/companion/sync-objects',
  '/companion/sync-pack', '/companion/sync-push', '/companion/sync-review-log',
  '/companion/sync-state'
]);

function failedMessage(event) {
  return event?.status === 'failed' && typeof event.message === 'string' ? event.message : null;
}

export function classifySyncFailure(event) {
  const message = failedMessage(event);
  if (!message) return null;
  const httpStatus = message.match(/(?:returned|response)\s+(\d{3})\b/iu)?.[1];
  if (httpStatus) return `http_${httpStatus}`;
  if (message.includes('workgroup_aead_response_required')) return 'workgroup_aead_response_required';
  if (message.includes('workgroup_aead_replayed')) return 'workgroup_aead_replayed';
  if (message.includes('Failed to sign companion sync request.')) return 'local_signing_unavailable';
  if (message.includes('sync_group_departure_authorization_invalid')) return 'sync_group_departure_invalid';
  if (message.includes('Failed to apply companion desktop sync pack.')) return 'sync_pack_apply_failed';
  if (/ConnectException|Failed to connect/iu.test(message)) return 'connection_failed';
  return 'unclassified';
}

export function boundedSyncFailureDetail(event) {
  return event?.status === 'failed' ? boundedSyncRunDetail(event) : null;
}

export function boundedSyncRunDetail(event) {
  return typeof event?.message === 'string'
    ? event.message.replace(/https?:\/\/\S+/giu, '<endpoint>').slice(0, 240) : null;
}

export function classifySyncFailureRoute(event) {
  const route = failedMessage(event)?.match(/(?:\bfor|\b(?:GET|POST)) (\/companion\/[a-z-]+)/iu)?.[1] ?? null;
  return route && PUBLIC_ROUTES.has(route) ? route : null;
}

export function classifySyncFailureStage(event) {
  const message = failedMessage(event);
  if (!message) return null;
  if (message.startsWith('Topic list sync failed:')) return 'structure';
  if (message.startsWith('Body download sync failed:')) return 'content';
  if (message.startsWith('Attachment file sync failed:')) return 'attachment';
  if (message.startsWith('Local change upload failed:')) return 'push';
  return 'target';
}
