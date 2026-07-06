import { useEffect, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { flushSync } from 'react-dom';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { companionMobileRailClassName } from './companionCssCompatibility';
import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import { type CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { isCompanionSelectionToolbarTarget } from './companionSelectionToolbarDom';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import { useCompanionReadingTypographySettings } from './useCompanionReadingTypographySettings';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import { definedProps } from '@/shared/lib/definedProps';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;
const ARTICLE_INTERACTIVE_TARGET_SELECTOR = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';

function isImmersiveArticleInteractiveTarget(target: EventTarget | null) {
  return isCompanionSelectionToolbarTarget(target) ||
    (target instanceof Element && target.closest(ARTICLE_INTERACTIVE_TARGET_SELECTOR) !== null);
}

interface ImmersiveReadableArticleProps {
  onAttachmentResourceSynced?: () => void;
  onCreateSelectionAnnotation?: (
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) => Promise<string | null> | string | null;
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string) => Promise<string | null> | string | null;
  onDeleteExistingHighlight?: (nodeId: string) => Promise<string | null> | string | null;
  onExit(): void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  onSaveArticleContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  snapshot: WorkspaceSnapshot | null;
  syncEndpointUrl?: string | null;
}

function ImmersiveArticleContent(props: {
  onAttachmentResourceSynced?: () => void;
  isContentEditing: boolean;
  onEditorReady(adapter: EditorAdapter | null): void;
  onSaveArticleContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
  readingSelection: EditorSelection | null;
  syncEndpointUrl?: string | null;
}) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[760px]">
      <ReadableArticleDocument
        allowContentEditing={props.isContentEditing}
        onEditorReady={props.onEditorReady}
        readableArticle={props.readableArticle}
        readingTypographySettings={props.readingTypographySettings}
        readingSelection={props.readingSelection}
        scrollContainer="outer"
        {...definedProps({
          onAttachmentResourceSynced: props.onAttachmentResourceSynced,
          onSaveContent: props.onSaveArticleContent,
          syncEndpointUrl: props.syncEndpointUrl
        })}
      />
    </div>
  );
}

function useImmersiveReadableArticleModel(props: ImmersiveReadableArticleProps) {
  const reading = useImmersiveReadableArticleState();
  const toolbar = useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: Boolean(props.onCreateSelectionAnnotation) && !reading.isContentEditing,
    nodeId: props.readableArticle.nodeId,
    snapshot: props.snapshot
  });
  useEffect(() => {
    if (reading.isContentEditing) toolbar.editorRef.current?.focus();
  }, [reading.isContentEditing, toolbar.editorRef]);
  function toggleContentEditing() {
    if (reading.isContentEditing) {
      reading.exitContentEditing();
      return;
    }
    toolbar.clearSelectionAndCloseToolbar();
    flushSync(() => {
      reading.enterContentEditing();
    });
    toolbar.editorRef.current?.focus();
  }
  function selectOutlineItem(item: { from: number; to: number }) {
    reading.handleSelectOutlineItem(item);
    toolbar.closeSelectionToolbar();
  }
  function closeToolbarFromArticlePointer(event: ReactPointerEvent<HTMLElement>) {
    if (isImmersiveArticleInteractiveTarget(event.target)) return;
    toolbar.closeSelectionToolbar();
  }
  function closeToolbarFromArticleTouch(event: ReactTouchEvent<HTMLElement>) {
    if (isImmersiveArticleInteractiveTarget(event.target)) return;
    toolbar.closeSelectionToolbar();
  }
  function openToolbarFromArticlePointer(event: ReactPointerEvent<HTMLElement>) {
    if (isImmersiveArticleInteractiveTarget(event.target)) return;
    toolbar.openSelectionToolbar(event);
  }
  const chromeReservedSpacing = 'pt-24 supports-[padding-top:calc(0px)]:[padding-top:calc(env(safe-area-inset-top)+6rem)] pb-20 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),80px)]';
  const surfaceClassName = `fixed top-0 right-0 bottom-0 left-0 z-surface-raised overflow-y-auto bg-companion-base ${companionMobileRailClassName} ${chromeReservedSpacing} text-foreground`;
  return {
    closeToolbarFromArticlePointer,
    closeToolbarFromArticleTouch,
    openToolbarFromArticlePointer,
    reading,
    selectOutlineItem,
    surfaceClassName,
    toggleContentEditing,
    toolbar
  };
}

function ImmersiveArticleChrome(props: {
  articleProps: ImmersiveReadableArticleProps;
  model: ReturnType<typeof useImmersiveReadableArticleModel>;
  readingTypography: ReturnType<typeof useCompanionReadingTypographySettings>;
}) {
  const { articleProps, model, readingTypography } = props;
  return (
    <ImmersiveChromeLayer
      actionsOpen={model.reading.isActionsSheetOpen}
      canEditContent={Boolean(articleProps.onSaveArticleContent)}
      editor={model.toolbar.editorRef.current}
      isChromeVisible={model.reading.isChromeVisible}
      isContentEditing={model.reading.isContentEditing}
      onExit={articleProps.onExit}
      onFindInDocument={model.reading.openDocumentSearch}
      onOpenActions={model.reading.setIsActionsSheetOpen}
      onOpenOutline={model.reading.setIsOutlineOpen}
      onOpenReadingSheet={model.reading.setOpenReadingSheet}
      onOpenSearchSheet={model.reading.setIsSearchSheetOpen}
      onReadingTypographySettingsChange={readingTypography.updateSettings}
      onSelectOutlineItem={model.selectOutlineItem}
      onToggleContentEditing={model.toggleContentEditing}
      openReadingSheet={model.reading.openReadingSheet}
      outlineOpen={model.reading.isOutlineOpen}
      readableArticle={articleProps.readableArticle}
      readingTypographySettings={readingTypography.settings}
      searchOpen={model.reading.isSearchSheetOpen}
      {...definedProps({ onRestoreFromTrash: articleProps.onRestoreFromTrash })}
    />
  );
}
export function ImmersiveReadableArticle(props: ImmersiveReadableArticleProps) {
  const model = useImmersiveReadableArticleModel(props);
  const readingTypography = useCompanionReadingTypographySettings();
  const pendingReadableArticle = useCompanionPendingReadableArticle(props.readableArticle);
  function createSelectionAnnotation(
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) {
    pendingReadableArticle.stageSelectionAnnotation(kind, payload);
    return props.onCreateSelectionAnnotation?.(kind, payload, note) ?? null;
  }
  function deleteExistingHighlight(nodeId: string) {
    pendingReadableArticle.stageDeletedHighlight(nodeId);
    const result = props.onDeleteExistingHighlight?.(nodeId) ?? null;
    return Promise.resolve(result).catch((error) => {
      pendingReadableArticle.restoreDeletedHighlight(nodeId);
      throw error;
    });
  }
  return (
    <section
      className={model.surfaceClassName}
      onClick={model.reading.handleSurfaceClick}
      onPointerDown={model.closeToolbarFromArticlePointer}
      onPointerMove={model.closeToolbarFromArticlePointer}
      onPointerUp={model.openToolbarFromArticlePointer}
      onTouchMove={model.closeToolbarFromArticleTouch}
    >
      <ImmersiveArticleChrome articleProps={props} model={model} readingTypography={readingTypography} />
      <ImmersiveArticleContent
        isContentEditing={model.reading.isContentEditing}
        onEditorReady={model.toolbar.handleEditorReady}
        readableArticle={pendingReadableArticle.readableArticle}
        readingTypographySettings={readingTypography.settings}
        readingSelection={model.reading.readingSelection}
        {...definedProps({
          onAttachmentResourceSynced: props.onAttachmentResourceSynced,
          onSaveArticleContent: props.onSaveArticleContent,
          syncEndpointUrl: props.syncEndpointUrl
        })}
      />
      <SelectionAnnotationToolbarLayer
        onClose={model.toolbar.clearSelectionAndCloseToolbar}
        resolveSelectionPayload={model.toolbar.resolveSelectionPayload}
        state={model.toolbar.selectionToolbar}
        {...definedProps({
          onAddExistingHighlightNote: props.onAddExistingHighlightNote,
          onCreateSelectionAnnotation: props.onCreateSelectionAnnotation ? createSelectionAnnotation : undefined,
          onDeleteExistingHighlight: props.onDeleteExistingHighlight ? deleteExistingHighlight : undefined
        })}
      />
    </section>
  );
}
