import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppEmptyState, appFloatingSurfaceClassName } from '../../shared/ui';

import type { ResolvedNodeLinkPreview } from './useNodeLinkHoverPreview';

interface NodeLinkHoverPreviewPanelProps {
  onDismiss: () => void;
  preview: ResolvedNodeLinkPreview | null;
}

const PANEL_MARGIN = 12;
const PANEL_GAP = 12;

function resolvePreviewLayout({ request: { anchorRect: anchor } }: ResolvedNodeLinkPreview) {
  const rightEdge = window.innerWidth - PANEL_MARGIN;
  const bottomEdge = window.innerHeight - PANEL_MARGIN;
  const width = Math.min(560, rightEdge - PANEL_MARGIN);
  const height = Math.min(520, bottomEdge - PANEL_MARGIN);
  const right = anchor.right + PANEL_GAP;
  const left = anchor.left - PANEL_GAP - width;
  if (right + width <= rightEdge || left >= PANEL_MARGIN) {
    const placeRight = right + width <= rightEdge;
    const top = Math.max(PANEL_MARGIN, Math.min(anchor.top, bottomEdge - height));
    return {
      panel: { height, left: placeRight ? right : left, top, width },
      gap: {
        height: Math.min(anchor.bottom, top + height) - Math.max(anchor.top, top),
        left: placeRight ? anchor.right : left + width,
        top: Math.max(anchor.top, top),
        width: PANEL_GAP
      }
    };
  }

  const below = anchor.bottom + PANEL_GAP;
  const above = anchor.top - PANEL_GAP;
  const placeBelow = bottomEdge - below >= Math.min(height, above - PANEL_MARGIN);
  const availableHeight = placeBelow ? bottomEdge - below : above - PANEL_MARGIN;
  const panelHeight = Math.min(height, availableHeight);
  const panelLeft = Math.max(PANEL_MARGIN, Math.min(anchor.left, rightEdge - width));
  return {
    panel: { height: panelHeight, left: panelLeft, top: placeBelow ? below : above - panelHeight, width },
    gap: {
      height: PANEL_GAP,
      left: Math.max(anchor.left, panelLeft),
      top: placeBelow ? anchor.bottom : above,
      width: Math.min(anchor.right, panelLeft + width) - Math.max(anchor.left, panelLeft)
    }
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
    <pre className="px-4 py-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
      {preview.content}
    </pre>
  );
}

export function NodeLinkHoverPreviewPanel(props: NodeLinkHoverPreviewPanelProps) {
  const t = useTranslation();

  if (!props.preview) {
    return null;
  }

  const { panel, gap } = resolvePreviewLayout(props.preview);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-workspace-overlay"
      data-node-link-preview
      onMouseLeave={props.onDismiss}
    >
      <div aria-hidden="true" className="pointer-events-auto absolute" style={gap} />
      <section
        aria-label={t('desktop.linkPreview.region')}
        className={appFloatingSurfaceClassName('panel', 'pointer-events-auto absolute flex flex-col overflow-hidden')}
        style={panel}
      >
        <header className="border-b border-[var(--app-floating-divider-color)] bg-[var(--app-floating-muted-bg)] px-4 py-3">
          <div className="truncate text-sm font-semibold text-foreground">{props.preview.title}</div>
          {props.preview.targetNodeId ? (
            <div className="mt-1 text-xs text-foreground/60">{t('desktop.linkPreview.subtitle')}</div>
          ) : null}
        </header>
        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas [--app-scrollbar-thumb-color:var(--app-floating-scrollbar-thumb-color)]">
          <PreviewBody preview={props.preview} />
        </div>
      </section>
    </div>
  );
}
