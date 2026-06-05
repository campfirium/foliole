import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppEmptyState, appFloatingSurfaceClassName } from '../../shared/ui';

import type { ResolvedNodeLinkPreview } from './useNodeLinkHoverPreview';

interface NodeLinkHoverPreviewPanelProps {
  preview: ResolvedNodeLinkPreview | null;
}

function resolvePanelStyle(preview: ResolvedNodeLinkPreview) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const panelWidth = Math.min(560, Math.max(320, viewportWidth - 24));
  const panelHeight = Math.min(520, Math.max(220, viewportHeight - 24));
  const preferredLeft = preview.request.anchorRect.right + 12;
  const fallbackLeft = preview.request.anchorRect.left - panelWidth - 12;
  const left =
    preferredLeft + panelWidth <= viewportWidth - 12
      ? preferredLeft
      : Math.max(12, Math.min(fallbackLeft, viewportWidth - panelWidth - 12));
  const fitsBelow = preview.request.anchorRect.top + panelHeight <= viewportHeight - 12;
  const top = fitsBelow
    ? Math.max(12, Math.min(preview.request.anchorRect.top, viewportHeight - panelHeight - 12))
    : Math.max(12, viewportHeight - panelHeight - 12);
  return {
    height: panelHeight,
    left,
    top,
    width: panelWidth
  };
}

function PreviewBody({ preview }: { preview: ResolvedNodeLinkPreview }) {
  const t = useTranslation();

  if (preview.status === 'missing') {
    return (
      <AppEmptyState
        description={t('desktop.linkPreview.missing.description')}
        title={t('desktop.linkPreview.missing.title')}
      />
    );
  }
  if (preview.status === 'loading') {
    return (
      <AppEmptyState
        description={t('desktop.linkPreview.loading.description')}
        title={t('desktop.linkPreview.loading.title')}
      />
    );
  }
  if (!preview.content.trim()) {
    return (
      <AppEmptyState
        description={t('desktop.linkPreview.empty.description')}
        title={t('desktop.linkPreview.empty.title')}
      />
    );
  }
  return (
    <article className="h-full overflow-hidden px-4 py-3">
      <pre className="h-full overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
        {preview.content}
      </pre>
    </article>
  );
}

export function NodeLinkHoverPreviewPanel(props: NodeLinkHoverPreviewPanelProps) {
  const t = useTranslation();

  if (!props.preview) {
    return null;
  }

  const panelStyle = resolvePanelStyle(props.preview);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-workspace-overlay">
      <section
        aria-label={t('desktop.linkPreview.region')}
        className={appFloatingSurfaceClassName('panel', 'absolute flex flex-col overflow-hidden')}
        style={panelStyle}
      >
        <header className="border-b border-border bg-bg-panel px-4 py-3">
          <div className="truncate text-sm font-semibold text-foreground">{props.preview.title}</div>
          {props.preview.targetNodeId ? (
            <div className="mt-1 text-xs text-foreground/60">{t('desktop.linkPreview.subtitle')}</div>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 bg-canvas">
          <PreviewBody preview={props.preview} />
        </div>
      </section>
    </div>
  );
}
