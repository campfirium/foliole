import type { RefObject } from 'react';
import { useCallback } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

import { LinkPanelStack } from './LinkPanelStack';
import type { useExternalLinkPanels } from './useExternalLinkPanels';

export function ExternalPreviewContent(args: {
  contentAreaRef: RefObject<HTMLDivElement | null>;
  editorAppearanceKey: string;
  linkPanels: ReturnType<typeof useExternalLinkPanels>['linkPanels'];
  localFileEditing: {
    content: string;
    handleChange: (content: string) => void;
    isEditable: boolean;
  };
  onCloseExternalLink: ReturnType<typeof useExternalLinkPanels>['handleCloseExternalLink'];
  onLinkPanelStateChange: ReturnType<typeof useExternalLinkPanels>['handleLinkPanelStateChange'];
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  preview: ExternalDocumentPreview;
}) {
  return (
    <>
      <ExternalArchivedNotice isPresent={args.preview.isPresent} />
      <ExternalPreviewEditor {...args} />
      <LinkPanelStack
        anchorRootRef={args.contentAreaRef}
        onClose={args.onCloseExternalLink}
        onStateChange={args.onLinkPanelStateChange}
        panels={args.linkPanels}
      />
    </>
  );
}

function ExternalArchivedNotice(args: { isPresent?: boolean | undefined }) {
  const t = useTranslation();
  if (args.isPresent !== false) {
    return null;
  }
  return (
    <div className="mx-auto mb-2 w-full max-w-[var(--document-max-width)] px-[var(--document-content-inline-padding)]">
      <div className="rounded-md border border-border/70 bg-panel px-3 py-2 text-sm text-foreground/70">
        {t('desktop.externalLibrary.preview.archivedNotice')}
      </div>
    </div>
  );
}

function ExternalPreviewEditor(args: {
  editorAppearanceKey: string;
  localFileEditing: {
    content: string;
    handleChange: (content: string) => void;
    isEditable: boolean;
  };
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  preview: ExternalDocumentPreview;
}) {
  const handleReady = useCallback((adapter: EditorAdapter | null) => {
    args.onPreviewEditorReady(adapter);
    if (adapter && args.localFileEditing.isEditable) {
      window.requestAnimationFrame(() => adapter.focus());
    }
  }, [args]);

  return (
    <MarkdownEditor
      blockImageMaxHeightOverride={520}
      blockImageWidthOverride="min(100%, 40rem)"
      className="min-h-0 flex-1"
      key={`external-library-${args.editorAppearanceKey}-${args.preview.absolutePath}`}
      localDocumentPath={args.localFileEditing.isEditable ? args.preview.absolutePath : null}
      nodeId={null}
      onChange={args.localFileEditing.isEditable ? args.localFileEditing.handleChange : () => undefined}
      onOpenExternalLink={args.onOpenExternalLink}
      onReady={handleReady}
      readOnly={!args.localFileEditing.isEditable}
      value={args.localFileEditing.isEditable ? args.localFileEditing.content : args.preview.content}
    />
  );
}
