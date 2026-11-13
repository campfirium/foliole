import { useEffect, useRef, type RefObject } from 'react';

import type { NativeReadingResumeContext } from '../../../lib/platform/nativeReadingProgressContract';
import { decodePdfReadingPosition, encodePdfReadingPosition } from '../../../lib/platform/pdfReadingPosition';
import type { PdfSystemController } from '../../features/pdf/model/pdfSystemApi';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
import { loadReadingResumeFromRuntime } from '../../shared/platform/workspaceRuntimeRepository';
import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';

export type PersistPdfViewState = (nodeId: string, viewState: NodeViewState, resume?: NativeReadingResumeContext) => void;

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
const SCROLL_INTENT_MS = 450;

function usePdfScrollIntent(surfaceRef: RefObject<HTMLElement | null>, isVisible: boolean) {
  const intent = useRef(0);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !isVisible) return;
    const onInput = (event: Event) => {
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      if (!(event.target instanceof Element) || !event.target.closest('[data-testid="pdf-scroll-container"]')) return;
      intent.current = event.target.closest('[data-testid="pdf-document-toolbar"]')
        ? 0 : performance.now() + SCROLL_INTENT_MS;
    };
    const events = ['wheel', 'pointerdown', 'touchmove', 'keydown'];
    for (const event of events) surface.addEventListener(event, onInput, { capture: true, passive: true });
    return () => {
      intent.current = 0;
      for (const event of events) surface.removeEventListener(event, onInput, true);
    };
  }, [isVisible, surfaceRef]);
  return intent;
}

type PdfResumeArgs = {
  nodeId: string | null;
  sourceHint: string;
  isVisible: boolean;
  pdfSystem: PdfSystemController;
  surfaceRef: RefObject<HTMLElement | null>;
  onPersistViewState: (viewState: NodeViewState, resume?: NativeReadingResumeContext) => void;
};

type PdfResumeSession = {
  context?: NativeReadingResumeContext;
  moved: boolean;
  pending?: NodeViewState;
  publish: boolean;
};

function jumpToPdfResume(args: PdfResumeArgs, offset: number) {
  const { page, positionY } = decodePdfReadingPosition(offset);
  args.pdfSystem.actions.requestReadingPosition(page, positionY);
}

function reportLoadError(error: unknown) {
  logRuntimeWarning('PDF reading position lookup failed', { area: 'persistence', action: 'load_pdf_reading_resume', error });
}

function usePdfResumeSync(args: PdfResumeArgs, session: RefObject<PdfResumeSession>, latest: RefObject<PdfResumeArgs>, scrollIntent: RefObject<number>) {
  const { nodeId, sourceHint, isVisible } = args;
  const t = useTranslation();
  const scope = useWorkspaceStore(state => state.libraryScope);
  useEffect(() => {
    const attachmentId = /^foliole-asset:\/\/attachment\/([a-f0-9]{64})\.pdf$/u.exec(sourceHint)?.[1];
    if (!nodeId || !attachmentId || !isVisible) return;
    const opened: PdfResumeSession = { moved: false, publish: false };
    session.current = opened;
    let disposed = false;
    let revision = 0;
    let notice: number | null = null;

    const load = () => loadReadingResumeFromRuntime(nodeId, attachmentId);
    const refresh = async () => {
      const requested = ++revision;
      const resume = await load();
      if (disposed || requested !== revision || !resume) return;
      const { page, positionY } = latest.current.pdfSystem.state;
      const offset = resume.offset;
      if (notice !== null) clearAppRuntimeNotice(notice);
      if (offset === null || offset === opened.context?.offset || offset <= encodePdfReadingPosition(page, positionY)) return;
      notice = showAppRuntimeNotice(t('desktop.document.readingResume.available'), 'info', {
        label: t('desktop.document.readingResume.jump'),
        onSelect: () => {
          if (disposed) return;
          opened.context = resume;
          opened.publish = false;
          scrollIntent.current = 0;
          jumpToPdfResume(latest.current, offset);
        }
      });
    };

    void load().then(resume => {
      if (disposed || !resume || opened.context) return;
      opened.context = resume;
      if (opened.pending) latest.current.onPersistViewState(opened.pending, resume);
      if (!opened.moved && resume.offset !== null) jumpToPdfResume(latest.current, resume.offset);
    }).catch(reportLoadError);

    const subscription = onWorkspaceSyncApplied(payload => {
      if (disposed || (payload.libraryScope && payload.libraryScope !== scope) ||
          !payload.appliedObjectIds.includes(`node_reading_resume:${nodeId}`)) return;
      void refresh().catch(reportLoadError);
    });
    return () => {
      disposed = true;
      if (notice !== null) clearAppRuntimeNotice(notice);
      void subscription.then(unlisten => unlisten?.());
    };
  }, [isVisible, latest, nodeId, scope, scrollIntent, session, sourceHint, t]);
}

export function usePdfReadingResume(args: PdfResumeArgs) {
  const latest = useRef(args);
  latest.current = args;
  const session = useRef<PdfResumeSession>({ moved: false, publish: false });
  const scrollIntent = usePdfScrollIntent(args.surfaceRef, args.isVisible);
  usePdfResumeSync(args, session, latest, scrollIntent);
  const markMovement = () => {
    session.current.moved = true;
    session.current.publish = true;
  };
  const { actions, state } = args.pdfSystem;
  return {
    markMovement,
    setSearchPosition: (page: number, positionY: number) => {
      scrollIntent.current = 0;
      if (page !== state.page || positionY !== state.positionY) markMovement();
      actions.setVisibleLocation(page, positionY);
    },
    actions: {
      ...actions,
      requestAnchorJump: (locator: Parameters<typeof actions.requestAnchorJump>[0]) => {
        markMovement();
        actions.requestAnchorJump(locator);
      },
      requestPageChange: (page: number) => {
        if (page !== state.page || state.positionY !== 0) markMovement();
        actions.requestPageChange(page);
      },
      stepPage: (step: -1 | 1) => {
        if ((step < 0 ? state.page > 1 : state.page < state.maxPage) || state.positionY !== 0) markMovement();
        actions.stepPage(step);
      },
      setVisibleLocation: (page: number, positionY: number) => {
        if (scrollIntent.current > performance.now() && (page !== state.page || positionY !== state.positionY)) markMovement();
        actions.setVisibleLocation(page, positionY);
      }
    },
    persist: (viewState: NodeViewState) => {
      const current = session.current;
      const publish = current.publish;
      current.publish = false;
      if (publish && !current.context) current.pending = viewState;
      args.onPersistViewState(viewState, publish ? current.context : undefined);
    }
  };
}
