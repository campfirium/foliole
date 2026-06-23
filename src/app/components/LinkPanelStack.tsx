import { ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { AppIconButton, appFloatingSurfaceClassName } from '../../shared/ui';

import { useLinkPanelViewportBounds } from './linkPanelBounds';
import {
  buildLinkPanelStyle,
  type LinkPanelWebviewTag,
  syncMissingLinkPanelPositions,
  useLinkPanelDrag,
  useLinkPanelLifecycle,
  useLinkPanelPositions,
  useLinkPanelResize,
  useLinkPanelSize
} from './linkPanelInteractions';
import type { LinkPanelSize } from './linkPanelPreferences';
import type { LinkPanelRecord } from './linkPanelState';
import { createAnchoredLinkPanelPosition, fitLinkPanelSizeToBounds, type LinkPanelPosition } from './linkPanelViewport';

function LinkPanelHeader(props: {
  onClose: (panelId: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  panel: LinkPanelRecord;
  webviewRef: RefObject<LinkPanelWebviewTag>;
}) {
  const t = useTranslation();

  return (
    <header
      className="flex cursor-move items-center gap-2 border-b border-[var(--app-floating-divider-color)] bg-[var(--app-floating-muted-bg)] px-3 py-2"
      onPointerDown={props.onDragStart}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{props.panel.title || props.panel.currentUrl}</div>
        <div className="truncate text-[12px] text-foreground/60">{props.panel.currentUrl}</div>
      </div>
      <AppIconButton
        disabled={!props.panel.canGoBack}
        icon={<ArrowLeft className="size-4" />}
        label={t('desktop.linkPanels.back')}
        onClick={() => props.webviewRef.current?.goBack()}
      />
      <AppIconButton
        disabled={!props.panel.canGoForward}
        icon={<ArrowRight className="size-4" />}
        label={t('desktop.linkPanels.forward')}
        onClick={() => props.webviewRef.current?.goForward()}
      />
      <AppIconButton
        icon={<ExternalLink className="size-4" />}
        label={t('desktop.linkPanels.openInBrowser')}
        onClick={() => void openExternalUrl(props.panel.currentUrl)}
      />
      <AppIconButton
        icon={<X className="size-4" />}
        label={t('desktop.linkPanels.close')}
        onClick={() => props.onClose(props.panel.id)}
      />
    </header>
  );
}

function LinkPanelCard(props: {
  onClose: (panelId: string) => void;
  onDragStart: (panelId: string, event: ReactPointerEvent<HTMLElement>, position: LinkPanelPosition) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>, size: LinkPanelSize) => void;
  onStateChange: (panelId: string, state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>) => void;
  panel: LinkPanelRecord;
  position: LinkPanelPosition;
  size: LinkPanelSize;
}) {
  const webviewRef = useRef<LinkPanelWebviewTag | null>(null);
  useLinkPanelLifecycle({ onStateChange: props.onStateChange, panelId: props.panel.id, webviewRef });

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview && webview.src !== props.panel.currentUrl) {
      webview.src = props.panel.currentUrl;
    }
  }, [props.panel.currentUrl]);

  return (
    <section
      aria-label={props.panel.title || props.panel.currentUrl}
      className={appFloatingSurfaceClassName('panel', 'pointer-events-auto absolute flex flex-col overflow-hidden')}
      style={buildLinkPanelStyle(props.position, props.size)}
    >
      <LinkPanelHeader
        onClose={props.onClose}
        onDragStart={(event) => {
          if ((event.target as HTMLElement | null)?.closest('button')) {
            return;
          }
          props.onDragStart(props.panel.id, event, props.position);
        }}
        panel={props.panel}
        webviewRef={webviewRef}
      />
      <webview
        allowpopups="false"
        className="h-full w-full bg-canvas"
        disablewebsecurity="false"
        nodeintegration="false"
        partition="foliole-link-panels"
        referrerpolicy="no-referrer"
        ref={webviewRef}
        src={props.panel.currentUrl}
        webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-0 size-5 cursor-nwse-resize"
        onPointerDown={(event) => props.onResizeStart(event, props.size)}
      />
    </section>
  );
}

export interface LinkPanelStackProps {
  anchorRootRef: RefObject<HTMLDivElement | null>;
  onClose: (panelId: string) => void;
  onStateChange: (panelId: string, state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>) => void;
  panels: LinkPanelRecord[];
}

export function LinkPanelStack(props: LinkPanelStackProps) {
  const t = useTranslation();
  const { setSize, size } = useLinkPanelSize();
  const bounds = useLinkPanelViewportBounds(props.anchorRootRef);
  const effectiveSize = useMemo(() => fitLinkPanelSizeToBounds(size, bounds), [bounds, size]);
  const { positions, setPositions } = useLinkPanelPositions(props.panels.length, effectiveSize, bounds);
  const handleDragStart = useLinkPanelDrag(bounds, setPositions, effectiveSize);
  const handleResizeStart = useLinkPanelResize(bounds, setSize);

  useEffect(() => {
    syncMissingLinkPanelPositions({ bounds, panels: props.panels, setPositions, size: effectiveSize });
  }, [bounds, effectiveSize, props.panels, setPositions]);

  if (props.panels.length === 0) {
    return null;
  }

  return (
    <div aria-label={t('desktop.linkPanels.region')} className="pointer-events-none fixed inset-0 z-workspace-overlay">
      {props.panels.map((panel, index) => (
        <LinkPanelCard
          key={panel.id}
          onClose={props.onClose}
          onDragStart={handleDragStart}
          onResizeStart={handleResizeStart}
          onStateChange={props.onStateChange}
          panel={panel}
          position={positions[panel.id] ?? createAnchoredLinkPanelPosition(index, effectiveSize, bounds, panel.anchorPoint)}
          size={effectiveSize}
        />
      ))}
    </div>
  );
}
