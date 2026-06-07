import { useEffect, useRef } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import { renderMermaidSvg } from '../adapters/liveMarkdownMermaidRenderer';
import type { MarkdownMermaidPreviewRequest } from '../model/markdownMermaidPreview';

interface MarkdownMermaidPreviewDialogProps {
  diagram: MarkdownMermaidPreviewRequest | null;
  onOpenChange: (open: boolean) => void;
}

function resolveMermaidKind(source: string) {
  return source.trimStart().split(/\s+/, 1)[0]?.toLowerCase() || 'diagram';
}

function applyPreviewSvgSizing(container: HTMLElement, kind: string) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  svg.style.setProperty('display', 'block');
  svg.style.setProperty('height', 'auto', 'important');
  svg.style.setProperty('max-width', 'none', 'important');
  svg.style.setProperty('flex', '0 0 auto');
  if (kind === 'gantt') {
    svg.style.setProperty('min-width', '92rem', 'important');
    svg.style.setProperty('width', '92rem', 'important');
    return;
  }
  if (kind === 'quadrantchart') {
    svg.style.setProperty('width', 'min(76vh, calc(100vw - 14rem), 80rem)', 'important');
    return;
  }
  svg.style.setProperty('width', 'min(100%, 80rem)', 'important');
}

function MarkdownMermaidPreviewBody(props: { source: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diagramKind = resolveMermaidKind(props.source);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    container.textContent = '';
    renderMermaidSvg(`foliole-mermaid-preview-${Date.now().toString(36)}`, props.source)
      .then((rendered) => {
        if (cancelled || !container.isConnected) return;
        // Trust only Mermaid strict/htmlLabels=false output here, not the raw user source.
        container.innerHTML = rendered.svg;
        applyPreviewSvgSizing(container, diagramKind);
        rendered.bindFunctions?.(container);
      })
      .catch(() => {
        if (cancelled || !container.isConnected) return;
        container.textContent = props.source;
      });

    return () => {
      cancelled = true;
    };
  }, [diagramKind, props.source]);

  return <div className="cm-md-mermaid-preview app-scrollbar" data-md-mermaid-kind={diagramKind} ref={containerRef} />;
}

export function MarkdownMermaidPreviewDialog(props: MarkdownMermaidPreviewDialogProps) {
  const t = useTranslation();
  const diagramKind = props.diagram ? resolveMermaidKind(props.diagram.source) : 'diagram';
  const shellClassName = [
    'relative max-h-[88vh] w-[min(1500px,calc(100vw-7rem))] overflow-auto rounded-md border border-border bg-canvas p-10 shadow-popover',
    diagramKind === 'gantt' ? '' : 'flex items-center justify-center'
  ].filter(Boolean).join(' ');

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={Boolean(props.diagram)}>
      <AppDialogPortal>
        <AppDialogOverlay className="bg-[var(--app-floating-overlay-bg)]" />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 z-preview-dialog max-w-none -translate-x-1/2 -translate-y-1/2 overflow-visible border-transparent bg-transparent p-0 shadow-none"
        >
          <AppDialogTitle className="sr-only">{t('desktop.editorPreview.diagramTitle')}</AppDialogTitle>
          <div className={shellClassName} data-md-mermaid-kind={diagramKind}>
            {props.diagram ? <MarkdownMermaidPreviewBody source={props.diagram.source} /> : null}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
