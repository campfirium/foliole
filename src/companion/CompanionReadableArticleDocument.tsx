import { Suspense, useCallback, useEffect, useRef } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionItemAnswer } from './CompanionItemAnswer';
import {
  CompanionPdfTextVersionToolbar,
  useCompanionPdfReadingEntry
} from './CompanionPdfReadingEntry';
import { CompanionPersistedPdfDocument } from './CompanionPersistedPdfDocument';
import { typographyStyle } from './companionReadableTypographyStyle';
import type { CompanionReadingActivity } from './companionReadingActivity';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionEditorDraftFlush } from './useCompanionEditorDraftFlush';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import type { EditorViewState } from '@/features/editor/components/markdownEditorTypes';
import { definedProps } from '@/shared/lib/definedProps';
import { syncCompanionAttachmentResourceFromDesktop } from '@/shared/platform/companionDesktopAttachmentResources';
import { saveCompanionSyncActiveViewState } from '@/shared/platform/companionSyncObjects';

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
  onBackToText?: () => void
) {
  return (
    <Suspense fallback={null}>
      <CompanionPersistedPdfDocument key={article.pdfAttachmentId}
        attachmentId={article.pdfAttachmentId ?? ''}
        onMissingResource={onMissingResource}
        title={article.title}
        {...definedProps({ onBackToText })}
      />
    </Suspense>
  );
}

function useReadableArticleEditorState(props: {
  allowContentEditing?: boolean;
  isViewingPdfOriginal: boolean;
  onSaveContent?: CompanionContentSaveHandler;
  readableArticle: ReadableArticle;
}) {
  const saveContent = props.onSaveContent;
  const editableNode = useRef<string | null>(null);
  const bodyReady = !props.readableArticle.bodyStatus || props.readableArticle.bodyStatus === 'ready';
  if (bodyReady && props.allowContentEditing && saveContent) editableNode.current = props.readableArticle.nodeId;
  if (!props.allowContentEditing || editableNode.current !== props.readableArticle.nodeId) editableNode.current = null;
  const canEdit = Boolean(
    props.allowContentEditing === true &&
    saveContent &&
    (bodyReady || (['missing', 'fetching'].includes(props.readableArticle.bodyStatus ?? '') && editableNode.current === props.readableArticle.nodeId))
  );
  const editorState = useCompanionTopicEditAutosave({
    canEdit: canEdit && !props.isViewingPdfOriginal,
    initialContent: props.readableArticle.content,
    initialVersionId: props.readableArticle.currentVersionId ?? null,
    nodeId: props.readableArticle.nodeId,
    ...definedProps({
      onSaveContent: saveContent
    })
  });
  return { canEdit: canEdit && editorState.ready, editorState };
}

function ReadableArticleTextDocument(props: {
  canEdit: boolean;
  isReviewItem?: boolean;
  layout?: 'article' | 'review';
  editorState: ReturnType<typeof useCompanionTopicEditAutosave>;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  readableArticle: ReadableArticle;
  readingRestoreCommandId?: string | null;
  readingSelection?: EditorSelection | null;
  readingTypographySettings: CompanionReadingTypographySettings;
  scrollContainer?: 'editor' | 'outer';
  syncMissingAttachmentResource(attachmentId: string): Promise<void>;
}) {
  const t = useTranslation();
  return (
    <div
      data-reading-contrast={props.readingTypographySettings.contrast}
      data-reading-font-family={props.readingTypographySettings.fontFamily}
      data-reading-font-size={props.readingTypographySettings.fontSize}
      data-reading-line-height={props.readingTypographySettings.lineHeight}
      style={typographyStyle(props.readingTypographySettings)}
    >
      <CompanionArticleDocument
        {...(props.isReviewItem ? { ariaLabel: t('companion.review.question') } : {})}
        key={props.canEdit ? `${props.readableArticle.nodeId}:editing` : `${props.readableArticle.nodeId}:reading`}
        content={props.editorState.value}
        layout={props.layout ?? 'article'}
        hideTitleHeading={props.readableArticle.hideTitleHeading}
        nodeId={props.readableArticle.nodeId}
        onBlurCapture={() => void props.editorState.flushPendingSave().catch(() => undefined)}
        onDocumentInput={props.editorState.markBufferedInput}
        onMissingAttachmentResource={props.syncMissingAttachmentResource}
        readingTargetViewportMode="center"
        textAnchorDecorations={props.readableArticle.textAnchorDecorations}
        {...definedProps({
          nodeViewState: toEditorViewState(props.readableArticle),
          onChange: props.canEdit ? props.editorState.handleChange : undefined,
          onEditorReady: props.onEditorReady,
          readingRestoreCommandId: props.readingRestoreCommandId,
          readingSelection: props.readingSelection,
          scrollContainer: props.scrollContainer
        })}
      />
    </div>
  );
}

type ReadableArticleDocumentProps = {
  activity?: CompanionReadingActivity;
  answer?: string | null;
  isReviewItem?: boolean;
  allowContentEditing?: boolean;
  layout?: 'article' | 'review';
  onAttachmentResourceSynced?: () => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onSaveContent?: CompanionContentSaveHandler;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
  readingRestoreCommandId?: string | null;
  readingSelection?: EditorSelection | null;
  scrollContainer?: 'editor' | 'outer';
  syncEndpointUrl?: string | null;
};

export function ReadableArticleDocument(props: ReadableArticleDocumentProps) {
  const pdfAttachmentId = props.readableArticle.pdfAttachmentId;
  const pdfReading = useCompanionPdfReadingEntry(props.readableArticle);
  const { canEdit, editorState: draft } = useReadableArticleEditorState({
    isViewingPdfOriginal: pdfReading.isViewingOriginal,
    readableArticle: props.readableArticle,
    ...definedProps({
      allowContentEditing: props.allowContentEditing,
      onSaveContent: props.onSaveContent
    })
  });
  const { editorState, onEditorReady, onAnswerEditorReady } = useCompanionEditorDraftFlush(draft, canEdit, props.onEditorReady);
  const syncMissingAttachmentResource = useReadableDocumentActivity(props, editorState);
  const canEditAnswer = canEdit && props.isReviewItem === true && props.answer != null;

  if (pdfAttachmentId && pdfReading.isViewingOriginal) {
    return renderOriginalPdf(
      props.readableArticle,
      syncMissingAttachmentResource,
      pdfReading.hasReadableText ? pdfReading.onBackToText : undefined
    );
  }
  if (!canEdit && props.readableArticle.bodyStatus && props.readableArticle.bodyStatus !== 'ready') {
    return <CompanionArticleBodyStatusFallback bodyStatus={props.readableArticle.bodyStatus} title={props.readableArticle.title} />;
  }

  return (
    <>
      {pdfAttachmentId ? (
        <CompanionPdfTextVersionToolbar onOpenPdf={pdfReading.onOpenPdf} />
      ) : null}
      <ReadableArticleTextDocument
        canEdit={canEdit}
        isReviewItem={props.isReviewItem === true}
        layout={props.layout ?? 'article'}
        editorState={editorState}
        onEditorReady={onEditorReady}
        readableArticle={props.readableArticle}
        readingTypographySettings={props.readingTypographySettings}
        syncMissingAttachmentResource={syncMissingAttachmentResource}
        {...definedProps({
          readingRestoreCommandId: props.readingRestoreCommandId,
          readingSelection: props.readingSelection,
          scrollContainer: props.scrollContainer
        })}
      />
      <CompanionItemAnswer answer={canEditAnswer ? editorState.reveal : props.answer ?? null}
        editing={canEditAnswer} nodeId={props.readableArticle.nodeId}
        style={typographyStyle(props.readingTypographySettings)} onMissingResource={syncMissingAttachmentResource}
        onChange={editorState.handleRevealChange} onEditorReady={onAnswerEditorReady}
        onDocumentInput={editorState.markRevealBufferedInput} onBlur={() => void editorState.flushPendingSave().catch(() => undefined)} />
      {editorState.error ? <p className="mt-3 px-1 text-sm text-error">{editorState.error}</p> : null}
    </>
  );
}

function useReadableDocumentActivity(props: Parameters<typeof ReadableArticleDocument>[0],
  editorState: ReturnType<typeof useCompanionTopicEditAutosave>) {
  useEffect(() => {
    const activity = props.activity;
    if (!activity) return;
    activity.flushDraft = editorState.flushPendingSave;
    activity.refreshDraft = editorState.refreshAfterHistory;
    activity.editRound = editorState.editRound;
    return () => {
      if (activity.flushDraft === editorState.flushPendingSave) activity.flushDraft = null;
      if (activity.refreshDraft === editorState.refreshAfterHistory) activity.refreshDraft = null;
      if (activity.editRound === editorState.editRound) activity.editRound = null;
    };
  }, [props.activity, editorState.flushPendingSave, editorState.editRound, editorState.refreshAfterHistory]);
  return useCallback(async (attachmentId: string) => {
    if (!props.syncEndpointUrl) return;
    await saveCompanionSyncActiveViewState(props.readableArticle.nodeId).catch(() => undefined);
    const result = await syncCompanionAttachmentResourceFromDesktop(props.syncEndpointUrl, attachmentId);
    if (result.status === 'cached') props.onAttachmentResourceSynced?.();
  }, [props.onAttachmentResourceSynced, props.readableArticle.nodeId, props.syncEndpointUrl]);

}
