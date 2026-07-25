import type { SyncDiagnosticVerdict } from '../../lib/platform/syncDiagnosticsContract';
import type { useTranslation } from '../shared/localization/LocalizationProvider';

type Translate = ReturnType<typeof useTranslation>;

export function friendlySyncDiagnosticVerdict(verdict: SyncDiagnosticVerdict, t: Translate) {
  if (verdict.code === 'sync_android_not_caught_up') {
    return {
      description: t('companion.sync.verdict.desktopChanges.description'),
      title: t('companion.sync.verdict.desktopChanges.title')
    };
  }
  if (verdict.code === 'sync_android_content_cache_backlog' || verdict.code === 'android_missing_content_blobs') {
    return {
      description: t('companion.sync.verdict.bodyBacklog.description'),
      title: t('companion.sync.verdict.bodyBacklog.title')
    };
  }
  if (verdict.code === 'sync_android_attachment_cache_backlog' || verdict.code === 'android_missing_attachment_resources') {
    return {
      description: t('companion.sync.verdict.attachmentBacklog.description'),
      title: t('companion.sync.verdict.attachmentBacklog.title')
    };
  }
  if (verdict.code === 'android_has_local_dirty_state') {
    return {
      description: t('companion.sync.verdict.localDirty.description'),
      title: t('companion.sync.verdict.localDirty.title')
    };
  }
  if (verdict.code === 'android_has_pending_push_ack') {
    return {
      description: t('companion.sync.verdict.pendingAck.description'),
      title: t('companion.sync.verdict.pendingAck.title')
    };
  }
  if (verdict.code === 'android_has_push_issues') {
    return {
      description: t('companion.sync.verdict.pushIssues.description'),
      title: t('companion.sync.verdict.pushIssues.title')
    };
  }
  if (verdict.code === 'sync_conflicts_safely_saved') {
    return {
      description: t('companion.sync.verdict.conflictCopies.description'),
      title: t('companion.sync.verdict.conflictCopies.title')
    };
  }
  if (verdict.code === 'desktop_ready') {
    return {
      description: t('companion.sync.verdict.desktopReady.description'),
      title: t('companion.sync.verdict.desktopReady.title')
    };
  }
  if (verdict.code === 'sync_structure_aligned') {
    return {
      description: t('companion.sync.verdict.structureAligned.description'),
      title: t('companion.sync.verdict.structureAligned.title')
    };
  }
  return { description: null, title: verdict.message };
}
