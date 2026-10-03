import { useEffect, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';

import { companionMobileRailClassName, companionReviewBottomInsetClassName } from './companionCssCompatibility';
import { findCompanionClozeTarget } from './companionExistingHighlightActions';
import { ImmersiveArticleContent } from './CompanionImmersiveArticleContent';
import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { resolveCompanionSearchSelection, type CompanionSearchMatch } from './companionSearchMatch';
import { type CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';
import { getDefaultSelectionClientPoint, resolveExistingHighlightToolbarState } from './companionSelectionToolbarState';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionImmersiveScrollPosition } from './useCompanionImmersiveScrollPosition';
import { useCompanionNodeTextAlternative } from './useCompanionNodeTextAlternative';
import { createPendingAnnotationActions, useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import { useCompanionReadingTypographySettings } from './useCompanionReadingTypographySettings';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

import { definedProps } from '@/shared/lib/definedProps';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

interface ImmersiveReadableArticleProps {
  activity?: CompanionReadingActivity;
  flow?: boolean;
  answer?: string | null;
  footer?: ReactNode;
  header?: ReactNode;
  searchMatch?: CompanionSearchMatch | null | undefined;
  onAttachmentResourceSynced?: () => void;
  onCreateSelectionAnnotation?: (
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) => Promise<string | null> | string | null;
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  onDeleteExistingHighlight?: (nodeId: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  onExit(): void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  onSaveArticleContent?: CompanionContentSaveHandler;
  onScrollTopChange?: (scrollTop: number) => void;
  readableArticle: ReadableArticle;
  snapshot: WorkspaceSnapshot | null;
  syncEndpointUrl?: string | null;
}

function useImmersiveReadableArticleModel(props: ImmersiveReadableArticleProps) {
  const reading = useImmersiveReadableArticleState(resolveCompanionSearchSelection(props.readableArticle.content, props.searchMatch));
  const snapshot = props.snapshot;
  const toolbar = useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: Boolean(props.onCreateSelectionAnnotation) && !reading.isContentEditing,
    nodeId: props.readableArticle.nodeId,
    snapshot
  });
  useEffect(() => {
    if (reading.isContentEditing) toolbar.editorRef.current?.focus();
  }, [reading.isContentEditing, toolbar.editorRef]);
  async function toggleContentEditing() {
    if (reading.isContentEditing) {
      try { await props.activity?.flush(); } catch { return; }
      reading.exitContentEditing();
      props.activity?.setEditing(false);
      return;
    }
    toolbar.clearSelectionAndCloseToolbar();
    flushSync(() => {
      reading.enterContentEditing();
      props.activity?.setEditing(true);
    });
    toolbar.editorRef.current?.focus();
  }
  function selectOutlineItem(item: { from: number; to: number }) {
    reading.handleSelectOutlineItem(item);
    toolbar.closeSelectionToolbar();
  }
  function closeToolbarFromArticlePointer(event: ReactPointerEvent<HTMLElement>) {
    if (isCompanionArticleInteractiveTarget(event.target)) return;
    toolbar.closeSelectionToolbar();
  }
  function closeToolbarFromArticleTouch(event: ReactTouchEvent<HTMLElement>) {
    if (isCompanionArticleInteractiveTarget(event.target)) return;
    toolbar.closeSelectionToolbar();
  }
  function openToolbarFromArticlePointer(event: ReactPointerEvent<HTMLElement>) {
    if (isCompanionArticleInteractiveTarget(event.target)) return;
    toolbar.openSelectionToolbar(event);
  }
  const chromeReservedSpacing = 'pt-14 supports-[padding-top:calc(0px)]:[padding-top:calc(env(safe-area-inset-top)+3.5rem)] pb-20 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),80px)]';
  const surfaceClassName = `fixed top-0 right-0 bottom-0 left-0 z-surface-raised overflow-y-auto bg-companion-base ${companionMobileRailClassName} ${chromeReservedSpacing} ${props.flow ? companionReviewBottomInsetClassName : ''} text-foreground`;
  const cloze = findCompanionClozeTarget(snapshot, props.readableArticle.nodeId);
  const openClozeRemoval = cloze && props.onDeleteExistingHighlight && !reading.isContentEditing ? () => {
    reading.setIsActionsSheetOpen(false);
    toolbar.setSelectionToolbar(resolveExistingHighlightToolbarState(cloze, getDefaultSelectionClientPoint()));
  } : undefined;
  return {
    openClozeRemoval,
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
  const textAlternative = useCompanionNodeTextAlternative({
    nodeId: articleProps.readableArticle.nodeId,
    ...definedProps({ onSetAsBody: articleProps.onSaveArticleContent })
  });
  return (
    <ImmersiveChromeLayer
      actionsAtTop={articleProps.flow === true}
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
      readingTypographySaveError={readingTypography.saveError}
      onSelectOutlineItem={model.selectOutlineItem}
      onToggleContentEditing={model.toggleContentEditing}
      openReadingSheet={model.reading.openReadingSheet}
      outlineOpen={model.reading.isOutlineOpen}
      readableArticle={articleProps.readableArticle}
      readingTypographySettings={readingTypography.settings}
      searchOpen={model.reading.isSearchSheetOpen}
      textAlternative={textAlternative}
      {...definedProps({ onRestoreFromTrash: articleProps.onRestoreFromTrash, onOpenClozeRemoval: model.openClozeRemoval })}
    />
  );
}
export function ImmersiveReadableArticle(props: ImmersiveReadableArticleProps) {
  const model = useImmersiveReadableArticleModel(props);
  const readingTypography = useCompanionReadingTypographySettings();
  const pendingReadableArticle = useCompanionPendingReadableArticle(props.readableArticle);
  const scrollPosition = useCompanionImmersiveScrollPosition(
    props.readableArticle.nodeId, props.readableArticle.persistedNodeViewState?.scrollTop ?? 0, props.onScrollTopChange
  );
  const { createSelectionAnnotation, deleteExistingHighlight } = createPendingAnnotationActions(props, pendingReadableArticle);
  return (
    <section
      className={model.surfaceClassName}
      onClick={model.reading.handleSurfaceClick}
      onPointerDown={model.closeToolbarFromArticlePointer}
      onPointerMove={model.closeToolbarFromArticlePointer}
      onPointerUp={model.openToolbarFromArticlePointer}
      onScroll={scrollPosition.handleScroll}
      onTouchMove={model.closeToolbarFromArticleTouch}
      ref={scrollPosition.surfaceRef}
    >
      <ImmersiveArticleChrome articleProps={props} model={model} readingTypography={readingTypography} />
      {props.header}
      <ImmersiveArticleContent
        isContentEditing={model.reading.isContentEditing}
        onEditorReady={model.toolbar.handleEditorReady}
        readableArticle={pendingReadableArticle.readableArticle}
        readingTypographySettings={readingTypography.settings}
        readingRestoreCommandId={model.reading.readingRestoreCommandId}
        readingSelection={model.reading.readingSelection}
        {...definedProps({
          activity: props.activity, answer: props.answer,
          onAttachmentResourceSynced: props.onAttachmentResourceSynced,
          onSaveArticleContent: props.onSaveArticleContent,
          syncEndpointUrl: props.syncEndpointUrl
        })}
      />
      {props.footer}
      <SelectionAnnotationToolbarLayer
        key={props.readableArticle.nodeId}
        snapshot={props.snapshot}
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
