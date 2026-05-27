import { useEffect, useRef } from 'react';

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

function MarkdownMermaidPreviewBody(props: { source: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    container.textContent = '';
    renderMermaidSvg(`foliole-mermaid-preview-${Date.now().toString(36)}`, props.source)
      .then((rendered) => {
        if (cancelled || !container.isConnected) return;
        container.innerHTML = rendered.svg;
        rendered.bindFunctions?.(container);
      })
      .catch(() => {
        if (cancelled || !container.isConnected) return;
        container.textContent = props.source;
      });

    return () => {
      cancelled = true;
    };
  }, [props.source]);

  return <div className="cm-md-mermaid-preview app-scrollbar" data-md-mermaid-kind={resolveMermaidKind(props.source)} ref={containerRef} />;
}

export function MarkdownMermaidPreviewDialog(props: MarkdownMermaidPreviewDialogProps) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={Boolean(props.diagram)}>
      <AppDialogPortal>
        <AppDialogOverlay className="bg-[var(--app-floating-overlay-bg)]" />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 z-preview-dialog max-w-none -translate-x-1/2 -translate-y-1/2 overflow-visible border-transparent bg-transparent p-0 shadow-none"
        >
          <AppDialogTitle className="sr-only">Diagram preview</AppDialogTitle>
          <div className="relative max-h-[88vh] w-[min(1500px,calc(100vw-7rem))] overflow-auto rounded-md border border-border bg-canvas p-10 shadow-popover">
            {props.diagram ? <MarkdownMermaidPreviewBody source={props.diagram.source} /> : null}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
