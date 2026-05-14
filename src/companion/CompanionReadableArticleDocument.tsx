import { useCallback, useState } from 'react';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import type { EditorViewState } from '@/features/editor/components/markdownEditorTypes';
import { SimplePdfDocument } from '@/features/pdf/components/SimplePdfDocument';
import { definedProps } from '@/shared/lib/definedProps';
import { syncCompanionAttachmentResourceFromDesktop } from '@/shared/platform/companionDesktopAttachmentResources';
import { saveCompanionSyncActiveViewState } from '@/shared/platform/companionSyncObjects';
import { AppButton } from '@/shared/ui';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

function toEditorViewState(article: ReadableArticle): EditorViewState | undefined {
  const persistedState = article.persistedNodeViewState;
  if (!persistedState) {
    return undefined;
  }
  const selection =
    persistedState.selectionFrom === null || persistedState.selectionTo === null
      ? null
      : { from: persistedState.selectionFrom, to: persistedState.selectionTo };
  return { scrollTop: persistedState.scrollTop, selection };
}

function renderOriginalPdf(
  article: ReadableArticle,
  onMissingResource: (attachmentId: string) => Promise<void>,
  onBackToText: () => void
) {
  return (
    <SimplePdfDocument
      attachmentId={article.pdfAttachmentId ?? ''}
      onBackToText={onBackToText}
      onMissingResource={onMissingResource}
      title={article.title}
    />
  );
}

function useReadableArticleEditorState(props: {
  isViewingPdfOriginal: boolean;
  onSaveContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
}) {
  const saveContent = props.onSaveContent;
  const canEdit = Boolean(saveContent && (!props.readableArticle.bodyStatus || props.readableArticle.bodyStatus === 'ready'));
  const editorState = useCompanionTopicEditAutosave({
    canEdit: canEdit && !props.isViewingPdfOriginal,
    initialContent: props.readableArticle.content,
    nodeId: props.readableArticle.nodeId,
    ...definedProps({
      onSaveContent: saveContent
        ? (content: string) => saveContent(props.readableArticle.nodeId, content)
        : undefined
    })
  });
  return { canEdit, editorState };
}

export function ReadableArticleDocument(props: {
  onAttachmentResourceSynced?: () => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onSaveContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  readingSelection?: EditorSelection | null;
  syncEndpointUrl?: string | null;
}) {
  const [isViewingPdfOriginal, setIsViewingPdfOriginal] = useState(false);
  const pdfAttachmentId = props.readableArticle.pdfAttachmentId;
  const { canEdit, editorState } = useReadableArticleEditorState({
    isViewingPdfOriginal,
    readableArticle: props.readableArticle,
    ...definedProps({ onSaveContent: props.onSaveContent })
  });
  const syncMissingAttachmentResource = useCallback(async (attachmentId: string) => {
    if (!props.syncEndpointUrl) return;
    await saveCompanionSyncActiveViewState(props.readableArticle.nodeId).catch(() => undefined);
    const result = await syncCompanionAttachmentResourceFromDesktop(props.syncEndpointUrl, attachmentId);
    if (result.status === 'cached') props.onAttachmentResourceSynced?.();
  }, [props.onAttachmentResourceSynced, props.readableArticle.nodeId, props.syncEndpointUrl]);

  if (pdfAttachmentId && isViewingPdfOriginal) {
    return renderOriginalPdf(props.readableArticle, syncMissingAttachmentResource, () => setIsViewingPdfOriginal(false));
  }
  if (props.readableArticle.bodyStatus && props.readableArticle.bodyStatus !== 'ready') {
    return <CompanionArticleBodyStatusFallback bodyStatus={props.readableArticle.bodyStatus} title={props.readableArticle.title} />;
  }

  return (
    <>
      {pdfAttachmentId ? (
        <div className="mb-3 flex items-center justify-between border-b border-companion-divider px-1 pb-3">
          <span className="text-xs text-companion-text-secondary">Text version</span>
          <AppButton onClick={() => setIsViewingPdfOriginal(true)} variant="ghost">
            Open PDF
          </AppButton>
        </div>
      ) : null}
      <CompanionArticleDocument
        content={editorState.value}
        hideTitleHeading={props.readableArticle.hideTitleHeading}
        nodeId={props.readableArticle.nodeId}
        onBlurCapture={() => void editorState.flushPendingSave()}
        onMissingAttachmentResource={syncMissingAttachmentResource}
        readingTargetViewportMode="center"
        textAnchorDecorations={props.readableArticle.textAnchorDecorations}
        {...definedProps({
          contentPaddingTop: props.readableArticle.contentPaddingTop,
          nodeViewState: toEditorViewState(props.readableArticle),
          onChange: canEdit ? editorState.handleChange : undefined,
          onEditorReady: props.onEditorReady,
          readingSelection: props.readingSelection
        })}
      />
      {editorState.error ? <p className="mt-3 px-1 text-sm text-error">{editorState.error}</p> : null}
    </>
  );
}
