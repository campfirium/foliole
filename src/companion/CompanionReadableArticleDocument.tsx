import { lazy, Suspense, type CSSProperties, useCallback } from 'react';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import {
  CompanionPdfTextVersionToolbar,
  useCompanionPdfReadingEntry
} from './CompanionPdfReadingEntry';
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

const FONT_FAMILY_VALUES: Record<CompanionReadingTypographySettings['fontFamily'], string> = {
  sans: 'var(--font-family-sans)',
  serif: 'Georgia, "Times New Roman", serif'
};

function typographyStyle(settings: CompanionReadingTypographySettings): CSSProperties {
  return {
    '--content-panel-font-family': FONT_FAMILY_VALUES[settings.fontFamily],
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

function ReadableArticleTextDocument(props: {
  canEdit: boolean;
  editorState: ReturnType<typeof useCompanionTopicEditAutosave>;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  readableArticle: ReadableArticle;
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
        onBlurCapture={() => void props.editorState.flushPendingSave()}
        onMissingAttachmentResource={props.syncMissingAttachmentResource}
        readingTargetViewportMode="center"
        textAnchorDecorations={props.readableArticle.textAnchorDecorations}
        {...definedProps({
          contentPaddingTop: props.readableArticle.contentPaddingTop,
          nodeViewState: toEditorViewState(props.readableArticle),
          onChange: props.canEdit ? props.editorState.handleChange : undefined,
          onEditorReady: props.onEditorReady,
          readingSelection: props.readingSelection,
          scrollContainer: props.scrollContainer
        })}
      />
    </div>
  );
}

export function ReadableArticleDocument(props: {
  allowContentEditing?: boolean;
  onAttachmentResourceSynced?: () => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onSaveContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
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
  const syncMissingAttachmentResource = useCallback(async (attachmentId: string) => {
    if (!props.syncEndpointUrl) return;
    await saveCompanionSyncActiveViewState(props.readableArticle.nodeId).catch(() => undefined);
    const result = await syncCompanionAttachmentResourceFromDesktop(props.syncEndpointUrl, attachmentId);
    if (result.status === 'cached') props.onAttachmentResourceSynced?.();
  }, [props.onAttachmentResourceSynced, props.readableArticle.nodeId, props.syncEndpointUrl]);

  if (pdfAttachmentId && pdfReading.isViewingOriginal) {
    return renderOriginalPdf(
      props.readableArticle,
      syncMissingAttachmentResource,
      pdfReading.hasReadableText ? pdfReading.onBackToText : undefined
    );
  }
  if (props.readableArticle.bodyStatus && props.readableArticle.bodyStatus !== 'ready') {
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
          readingSelection: props.readingSelection,
          scrollContainer: props.scrollContainer
        })}
      />
      {editorState.error ? <p className="mt-3 px-1 text-sm text-error">{editorState.error}</p> : null}
    </>
  );
}
