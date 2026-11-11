import { useEffect, useRef } from 'react';

import type { NativeReadingResumeContext } from '../../../lib/platform/nativeReadingProgressContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
import { loadReadingResumeFromRuntime } from '../../shared/platform/workspaceRuntimeRepository';
import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { requestReadingPositionApply } from './readingPositionRequests';
import type { useAppRuntime } from './useAppRuntime';

type Runtime = ReturnType<typeof useAppRuntime>;

function jumpToSharedPosition(runtime: Runtime, resume: NativeReadingResumeContext, offset: number) {
  void window.__folioleFlushReadingProgressBeforeClose?.().catch(error => logRuntimeWarning(
    'reading position flush failed', { area: 'persistence', action: 'accept_reading_resume', error }
  ));
  runtime.readingResumeContextRef.current = resume;
  runtime.readingResumeMovedNodeIdRef.current = null;
  requestReadingPositionApply({
    nodeId: resume.nodeId, reason: 'synced-reading-resume', runtime,
    selection: { from: offset, to: offset }, targetViewportMode: 'reading-position'
  });
}

export function useReadingResumeOffer(nodeId: string | null, runtime: Runtime) {
  const t = useTranslation();
  const currentRuntime = useRef(runtime);
  currentRuntime.current = runtime;
  useEffect(() => {
    if (!nodeId) return;
    let disposed = false;
    let noticeId: number | null = null;
    let lastOffered: { contentHash: string; offset: number } | null = null;
    let revision = 0;
    let unlisten: (() => void) | null = null;

    const refresh = async () => {
      const requestedRevision = ++revision;
      const resume = await loadReadingResumeFromRuntime(nodeId);
      if (disposed || requestedRevision !== revision) return;
      const refs = currentRuntime.current;
      const observed = refs.readingResumeContextRef.current;
      const currentOffset = refs.editorRef.current?.getPrimaryVisiblePosition?.();
      const sharedOffset = resume?.offset;
      if (!resume || sharedOffset == null || currentOffset == null || sharedOffset <= currentOffset ||
          (observed && observed.contentHash !== resume.contentHash)) {
        if (noticeId !== null) clearAppRuntimeNotice(noticeId);
        return;
      }
      if ([lastOffered, observed].some(position =>
        position?.contentHash === resume.contentHash && position.offset === sharedOffset
      )) return;
      lastOffered = { contentHash: resume.contentHash, offset: sharedOffset };
      noticeId = showAppRuntimeNotice(t('desktop.document.readingResume.available'), 'info', {
        label: t('desktop.document.readingResume.jump'),
        onSelect: () => {
          if (!disposed) jumpToSharedPosition(currentRuntime.current, resume, sharedOffset);
        }
      });
    };

    void onWorkspaceSyncApplied(payload => {
      if (disposed || !payload.appliedObjectIds.includes(`node_reading_resume:${nodeId}`)) return;
      const scope = useWorkspaceStore.getState().libraryScope;
      if (payload.libraryScope && payload.libraryScope !== scope) return;
      void refresh().catch(error => logRuntimeWarning('reading position lookup failed', {
        area: 'persistence', action: 'offer_reading_resume', error
      }));
    }).then(listener => {
      if (disposed) listener?.();
      else unlisten = listener;
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (noticeId !== null) clearAppRuntimeNotice(noticeId);
    };
  }, [nodeId, t]);
}
