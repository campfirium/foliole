import { useRef } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { RuntimeExternalSearchPreview } from '../../shared/platform/externalSearchBridge';
import { AppButton } from '../../shared/ui';

import { LinkPanelStack } from './LinkPanelStack';
import { useExternalLinkPanels } from './useExternalLinkPanels';

export function ExternalLibraryPreviewSurface(args: {
  isImporting: boolean;
  onHandleImport: () => void;
  preview: RuntimeExternalSearchPreview;
}) {
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();

  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground">{args.preview.fileName}</div>
          <div className="mt-1 break-all text-sm text-foreground/60">{args.preview.relativePath}</div>
        </div>
        <AppButton disabled={args.isImporting} onClick={args.onHandleImport}>
          Import
        </AppButton>
      </div>
      <div className="relative min-h-0 flex-1" ref={contentAreaRef}>
        <MarkdownEditor
          blockImageMaxHeightOverride={520}
          blockImageWidthOverride="min(100%, 40rem)"
          className="h-full"
          nodeId={args.preview.absolutePath}
          onChange={() => undefined}
          onOpenExternalLink={handleOpenExternalLink}
          readOnly
          value={args.preview.content}
        />
        <LinkPanelStack
          anchorRootRef={contentAreaRef}
          onClose={handleCloseExternalLink}
          onStateChange={handleLinkPanelStateChange}
          panels={linkPanels}
        />
      </div>
    </section>
  );
}
