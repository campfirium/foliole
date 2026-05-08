import type { SyncDiagnosticVerdict } from '../../lib/platform/syncDiagnosticsContract';

export function friendlySyncDiagnosticVerdict(verdict: SyncDiagnosticVerdict) {
  if (verdict.code === 'sync_android_not_caught_up') {
    return {
      description: 'Foliole will bring them in on the next sync.',
      title: 'New desktop changes are available'
    };
  }
  if (verdict.code === 'sync_android_content_cache_backlog' || verdict.code === 'android_missing_content_blobs') {
    return {
      description: 'Topics can open now; missing bodies download as needed.',
      title: 'Body downloads are still running'
    };
  }
  if (verdict.code === 'sync_android_attachment_cache_backlog' || verdict.code === 'android_missing_attachment_resources') {
    return {
      description: 'Attachment files keep downloading during sync.',
      title: 'Attachment files are still downloading'
    };
  }
  if (verdict.code === 'android_has_local_dirty_state') {
    return {
      description: 'They will be sent to desktop during sync.',
      title: 'Device changes are waiting to send'
    };
  }
  if (verdict.code === 'android_has_pending_push_ack') {
    return {
      description: 'A later structure pack must confirm these changes before they are marked clean.',
      title: 'Desktop accepted changes; waiting for confirmation'
    };
  }
  if (verdict.code === 'android_has_push_issues') {
    return {
      description: 'Open the sync diagnostic details to see which device changes need attention.',
      title: 'Device changes need review'
    };
  }
  if (verdict.code === 'desktop_ready') {
    return {
      description: 'Desktop sync is reachable from this device.',
      title: 'Desktop connection is ready'
    };
  }
  if (verdict.code === 'sync_structure_aligned') {
    return {
      description: 'The Topic list matches the desktop state.',
      title: 'Topic list is up to date'
    };
  }
  return { description: null, title: verdict.message };
}
