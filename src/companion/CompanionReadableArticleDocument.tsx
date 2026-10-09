import { lazy, Suspense, type CSSProperties, useCallback, useEffect, useRef } from 'react';

import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import {
  CompanionPdfTextVersionToolbar,
  useCompanionPdfReadingEntry
} from './CompanionPdfReadingEntry';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { readingFontCssFamily } from './companionReadingFonts';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import type { EditorViewState } from '@/features/editor/components/markdownEditorTypes';
import { definedProps } from '@/shared/lib/definedProps';
import { syncCompanionAttachmentResourceFromDesktop } from '@/shared/platform/companionDesktopAttachmentResources';
import { saveCompanionSyncActiveViewState } from '@/shared/platform/companionSyncObjects';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;
const SimplePdfDocument = lazy(() =>
  import('@/features/pdf/components/SimplePdfDocument').then((module) => ({ default: module.SimplePdfDocument }))
);

const FONT_SIZE_VALUES: Record<CompanionReadingTypographySettings['fontSize'], string> = {
  default: '1.0625rem',
  large: '1.1875rem',
  small: '0.9375rem',
  xlarge: '1.3125rem'
};

const LINE_HEIGHT_VALUES: Record<CompanionReadingTypographySettings['lineHeight'], string> = {
  compact: '1.45',
  default: '1.62',
  relaxed: '1.78'
};

const PARAGRAPH_SPACING = '0.35em';

function readingFontFamily(value: CompanionReadingTypographySettings['fontFamily']) {
  if (value === 'serif') return 'Georgia, "Times New Roman", serif';
  if (value === 'sans') return 'var(--font-family-sans)';
  if (value.startsWith('system:')) return `"${value.slice(7)}", var(--font-family-sans)`;
  return `"${readingFontCssFamily(value.slice(7))}", var(--font-family-sans)`;
}

function typographyStyle(settings: CompanionReadingTypographySettings): CSSProperties {
  return {
    '--content-panel-font-family': readingFontFamily(settings.fontFamily),
    '--content-panel-font-size': FONT_SIZE_VALUES[settings.fontSize],
    '--content-panel-line-height': LINE_HEIGHT_VALUES[settings.lineHeight],
    '--content-panel-paragraph-spacing': PARAGRAPH_SPACING,
    '--document-content-inline-padding': '0px',
    '--content-panel-text-color': settings.contrast === 'high'
      ? 'var(--color-text-primary)'
      : 'color-mix(in srgb, var(--color-text-primary) 92%, var(--color-text-secondary))'
  } as CSSProperties;
}

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
      <SimplePdfDocument
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
  editorState: ReturnType<typeof useCompanionTopicEditAutosave>;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  readableArticle: ReadableArticle;
  readingRestoreCommandId?: string | null;
  readingSelection?: EditorSelection | null;
  readingTypographySettings: CompanionReadingTypographySettings;
  scrollContainer?: 'editor' | 'outer';
  syncMissingAttachmentResource(attachmentId: string): Promise<void>;
}) {
  return (
    <div
      data-reading-contrast={props.readingTypographySettings.contrast}
      data-reading-font-family={props.readingTypographySettings.fontFamily}
      data-reading-font-size={props.readingTypographySettings.fontSize}
      data-reading-line-height={props.readingTypographySettings.lineHeight}
      style={typographyStyle(props.readingTypographySettings)}
    >
      <CompanionArticleDocument
        key={props.canEdit ? `${props.readableArticle.nodeId}:editing` : `${props.readableArticle.nodeId}:reading`}
        content={props.editorState.value}
        hideTitleHeading={props.readableArticle.hideTitleHeading}
        nodeId={props.readableArticle.nodeId}
        onBlurCapture={() => void props.editorState.flushPendingSave().catch(() => undefined)}
        onMissingAttachmentResource={props.syncMissingAttachmentResource}
        readingTargetViewportMode="center"
        textAnchorDecorations={props.readableArticle.textAnchorDecorations}
        {...definedProps({
          contentPaddingTop: props.readableArticle.contentPaddingTop,
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

export function ReadableArticleDocument(props: {
  activity?: CompanionReadingActivity;
  answer?: string | null;
  allowContentEditing?: boolean;
  onAttachmentResourceSynced?: () => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onSaveContent?: CompanionContentSaveHandler;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
  readingRestoreCommandId?: string | null;
  readingSelection?: EditorSelection | null;
  scrollContainer?: 'editor' | 'outer';
  syncEndpointUrl?: string | null;
}) {
  const pdfAttachmentId = props.readableArticle.pdfAttachmentId;
  const pdfReading = useCompanionPdfReadingEntry(props.readableArticle);
  const { canEdit, editorState } = useReadableArticleEditorState({
    isViewingPdfOriginal: pdfReading.isViewingOriginal,
    readableArticle: props.readableArticle,
    ...definedProps({
      allowContentEditing: props.allowContentEditing,
      onSaveContent: props.onSaveContent
    })
  });
  const syncMissingAttachmentResource = useReadableDocumentActivity(props, editorState);

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
        editorState={editorState}
        readableArticle={props.readableArticle}
        readingTypographySettings={props.readingTypographySettings}
        syncMissingAttachmentResource={syncMissingAttachmentResource}
        {...definedProps({
          onEditorReady: props.onEditorReady,
          readingRestoreCommandId: props.readingRestoreCommandId,
          readingSelection: props.readingSelection,
          scrollContainer: props.scrollContainer
        })}
      />
      <ReadableArticleAnswer answer={props.answer ?? null} article={props.readableArticle}
        settings={props.readingTypographySettings} onMissingResource={syncMissingAttachmentResource} />
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
    return () => { if (activity.flushDraft === editorState.flushPendingSave) activity.flushDraft = null; };
  }, [props.activity, editorState.flushPendingSave]);
  return useCallback(async (attachmentId: string) => {
    if (!props.syncEndpointUrl) return;
    await saveCompanionSyncActiveViewState(props.readableArticle.nodeId).catch(() => undefined);
    const result = await syncCompanionAttachmentResourceFromDesktop(props.syncEndpointUrl, attachmentId);
    if (result.status === 'cached') props.onAttachmentResourceSynced?.();
  }, [props.onAttachmentResourceSynced, props.readableArticle.nodeId, props.syncEndpointUrl]);

}

function ReadableArticleAnswer(props: { answer: string | null; article: ReadableArticle;
  settings: CompanionReadingTypographySettings; onMissingResource: (id: string) => Promise<void> }) {
  if (!props.answer) return null;
  return <div style={typographyStyle(props.settings)} className="border-t border-companion-divider pt-5">
    <CompanionArticleDocument content={props.answer} nodeId={props.article.nodeId + '::answer'}
      layout="review" scrollContainer="outer" onMissingAttachmentResource={props.onMissingResource} />
  </div>;
}
