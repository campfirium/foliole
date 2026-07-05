import { lazy, Suspense, useCallback, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import type { EditorViewState } from '@/features/editor/components/markdownEditorTypes';
import { definedProps } from '@/shared/lib/definedProps';
import { syncCompanionAttachmentResourceFromDesktop } from '@/shared/platform/companionDesktopAttachmentResources';
import { saveCompanionSyncActiveViewState } from '@/shared/platform/companionSyncObjects';
import { AppButton } from '@/shared/ui';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;
const SimplePdfDocument = lazy(() =>
  import('@/features/pdf/components/SimplePdfDocument').then((module) => ({ default: module.SimplePdfDocument }))
);

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
    <Suspense fallback={null}>
      <SimplePdfDocument
        attachmentId={article.pdfAttachmentId ?? ''}
        onBackToText={onBackToText}
        onMissingResource={onMissingResource}
        title={article.title}
      />
    </Suspense>
  );
}

function useReadableArticleEditorState(props: {
  allowContentEditing?: boolean;
  isViewingPdfOriginal: boolean;
  onSaveContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
}) {
  const saveContent = props.onSaveContent;
  const canEdit = Boolean(
    props.allowContentEditing === true &&
    saveContent &&
    (!props.readableArticle.bodyStatus || props.readableArticle.bodyStatus === 'ready')
  );
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

function PdfTextVersionToolbar(props: {
  onOpenPdf(): void;
}) {
  const t = useTranslation();
  return (
    <div className="mb-3 flex items-center justify-between border-b border-companion-divider px-1 pb-3">
      <span className="text-xs text-companion-text-secondary">{t('companion.reading.textVersion')}</span>
      <AppButton onClick={props.onOpenPdf} variant="ghost">
        {t('companion.reading.openPdf')}
      </AppButton>
    </div>
  );
}

export function ReadableArticleDocument(props: {
  allowContentEditing?: boolean;
  onAttachmentResourceSynced?: () => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onSaveContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  readingSelection?: EditorSelection | null;
  scrollContainer?: 'editor' | 'outer';
  syncEndpointUrl?: string | null;
}) {
  const [isViewingPdfOriginal, setIsViewingPdfOriginal] = useState(false);
  const pdfAttachmentId = props.readableArticle.pdfAttachmentId;
  const { canEdit, editorState } = useReadableArticleEditorState({
    isViewingPdfOriginal,
    readableArticle: props.readableArticle,
    ...definedProps({
      allowContentEditing: props.allowContentEditing,
      onSaveContent: props.onSaveContent
    })
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
      {pdfAttachmentId ? <PdfTextVersionToolbar onOpenPdf={() => setIsViewingPdfOriginal(true)} /> : null}
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
          readingSelection: props.readingSelection,
          scrollContainer: props.scrollContainer
        })}
      />
      {editorState.error ? <p className="mt-3 px-1 text-sm text-error">{editorState.error}</p> : null}
    </>
  );
}
