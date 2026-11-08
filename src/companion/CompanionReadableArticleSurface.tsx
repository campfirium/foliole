import { useEffect, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';
import { canCreateSelectionAnnotation } from '../shared/selectionAnnotationEligibility';

import { CompanionArticleSelectionLayer } from './CompanionArticleSelectionLayer';
import { useCompanionArticleExit } from './CompanionArticleTransition';
import type { CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import { findCompanionClozeTarget } from './companionExistingHighlightActions';
import type { CompanionHighlightRangeHandler } from './companionHighlightRangePersistence';
import { ImmersiveArticleContent } from './CompanionImmersiveArticleContent';
import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionReadingDisplayLayout } from './companionReadingDisplayLayout';
import { CompanionReviewHeader } from './CompanionReviewHeader';
import { resolveCompanionSearchSelection, type CompanionSearchMatch } from './companionSearchMatch';
import { type CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';
import { getDefaultSelectionClientPoint, resolveExistingHighlightToolbarState } from './companionSelectionToolbarState';
import { useCompanionArticleScrollPosition } from './useCompanionArticleScrollPosition';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionContentEditingActions } from './useCompanionContentEditingActions';
import { useCompanionItemEditViewport } from './useCompanionItemEditViewport';
import { useCompanionNodeTextAlternative } from './useCompanionNodeTextAlternative';
import { useCompanionPagedScroll } from './useCompanionPagedScroll';
import { useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import { useCompanionReadableAndroidBack } from './useCompanionReadableAndroidBack';
import type { CompanionReadingNavigationControls } from './useCompanionReadingNavigation';
import { useCompanionReadingTypographySettings } from './useCompanionReadingTypographySettings';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

import { definedProps } from '@/shared/lib/definedProps';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

export interface ImmersiveReadableArticleProps {
  editHistory?: CompanionEditHistoryActionsProps;
  navigation?: CompanionReadingNavigationControls | undefined;
  activity?: CompanionReadingActivity;
  flow?: boolean;
  answer?: string | null;
  isReviewItem?: boolean;
  footer?: ReactNode;
  endOfArticleAction?: ReactNode;
  header?: ReactNode;
  searchMatch?: CompanionSearchMatch | null | undefined;
  onAttachmentResourceSynced?: () => void;
  onCreateSelectionAnnotation?: (
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) => Promise<string | null> | string | null;
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  onAdjustExistingHighlightRange?: CompanionHighlightRangeHandler;
  onDeleteExistingHighlight?: (nodeId: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
  onOpenExistingHighlight?: ((nodeId: string) => void) | undefined;
  onBack?: () => void;
  onExit(): void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  onSaveArticleContent?: CompanionContentSaveHandler;
  onScrollTopChange?: (scrollTop: number) => void;
  readableArticle: ReadableArticle;
  snapshot: WorkspaceSnapshot | null;
  syncEndpointUrl?: string | null;
}

function createArticleToolbarEvents(
  toolbar: ReturnType<typeof useCompanionSelectionAnnotationToolbar>,
  reading: ReturnType<typeof useImmersiveReadableArticleState>
) {
  function closeToolbarFromArticlePointer(event: ReactPointerEvent<HTMLElement>) {
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.closeSelectionToolbar();
  }
  function closeToolbarFromArticleTouch(event: ReactTouchEvent<HTMLElement>) {
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.closeSelectionToolbar();
  }
  function openToolbarFromArticlePointer(event: ReactPointerEvent<HTMLElement>) {
    reading.handleSurfacePointerUp(event);
    if (!isCompanionArticleInteractiveTarget(event.target)) toolbar.openSelectionToolbar(event);
  }
  function handleSurfacePointerDown(event: ReactPointerEvent<HTMLElement>) {
    reading.handleSurfacePointerDown(event);
    closeToolbarFromArticlePointer(event);
  }
  function handleSurfacePointerMove(event: ReactPointerEvent<HTMLElement>) {
    reading.handleSurfacePointerMove(event);
    closeToolbarFromArticlePointer(event);
  }
  return { handleSurfacePointerDown, handleSurfacePointerMove, closeToolbarFromArticleTouch, openToolbarFromArticlePointer };
}

function useImmersiveReadableArticleModel(props: ImmersiveReadableArticleProps) {
  const reading = useImmersiveReadableArticleState(resolveCompanionSearchSelection(props.readableArticle.content, props.searchMatch));
  const snapshot = props.snapshot;
  const toolbar = useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: Boolean(props.onCreateSelectionAnnotation) &&
      canCreateSelectionAnnotation(snapshot?.nodesById[props.readableArticle.nodeId]) && !reading.isContentEditing,
    nodeId: props.readableArticle.nodeId,
    snapshot
  });
  useEffect(() => {
    if (reading.isContentEditing) toolbar.editorRef.current?.focus();
  }, [reading.isContentEditing, toolbar.editorRef]);
  const { cancelContentEditing, toggleContentEditing } = useCompanionContentEditingActions({
    activity: props.activity,
    editing: reading.isContentEditing,
    enter: reading.enterContentEditing,
    exit: reading.exitContentEditing,
    focusEditor: () => toolbar.editorRef.current?.focus(),
    prepareEnter: toolbar.clearSelectionAndCloseToolbar
  });
  useCompanionReadableAndroidBack({
    editing: reading.isContentEditing,
    selectionOpen: Boolean(toolbar.selectionToolbar),
    closeSelection: toolbar.clearSelectionAndCloseToolbar,
    finishEditing: toggleContentEditing,
    exit: props.onBack ?? props.onExit
  });
  function selectOutlineItem(item: { from: number; to: number }) {
    reading.handleSelectOutlineItem(item);
    toolbar.closeSelectionToolbar();
  }
  const toolbarEvents = createArticleToolbarEvents(toolbar, reading);
  const surfaceClassName = useCompanionReadingDisplayLayout(props.flow, reading.isContentEditing);
  const cloze = findCompanionClozeTarget(snapshot, props.readableArticle.nodeId);
  const openClozeRemoval = cloze && props.onDeleteExistingHighlight && !reading.isContentEditing ? () => {
    reading.setIsActionsSheetOpen(false);
    toolbar.setSelectionToolbar(resolveExistingHighlightToolbarState(cloze, getDefaultSelectionClientPoint()));
  } : undefined;
  return {
    cancelContentEditing,
    openClozeRemoval,
    ...toolbarEvents,
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
      activity={articleProps.activity}
      onOpenOutlineNode={articleProps.onOpenExistingHighlight}
      snapshot={articleProps.snapshot}
      {...definedProps({ editHistory: articleProps.editHistory })}
      navigation={articleProps.navigation}
      actionsAtTop={articleProps.flow === true}
      isReviewItem={articleProps.isReviewItem === true}
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
      readingTypographyFontLoadError={readingTypography.fontLoadError}
      onSelectOutlineItem={model.selectOutlineItem}
      onCancelContentEditing={model.cancelContentEditing}
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
  const onExit = useCompanionArticleExit(props.onExit);
  const onBack = useCompanionArticleExit(props.onBack ?? props.onExit);
  const model = useImmersiveReadableArticleModel({ ...props, onExit, onBack });
  const readingTypography = useCompanionReadingTypographySettings();
  const pendingReadableArticle = useCompanionPendingReadableArticle(props.readableArticle);
  const scrollPosition = useCompanionArticleScrollPosition({
    nodeId: props.readableArticle.nodeId, external: props.snapshot === null,
    scrollTop: props.readableArticle.persistedNodeViewState?.scrollTop ?? 0, onScrollTopChange: props.onScrollTopChange
  });
  const itemEditing = model.reading.isContentEditing && props.isReviewItem === true && props.answer != null;
  useCompanionItemEditViewport(scrollPosition.surfaceRef, itemEditing);
  const pagedStyle = useCompanionPagedScroll(scrollPosition.surfaceRef, model.reading.isContentEditing);
  return (
    <section
      data-companion-reading-surface="true"
      data-reading-end-action={Boolean(props.endOfArticleAction) && !model.reading.isContentEditing || undefined}
      data-reading-chrome-visible={model.reading.isChromeVisible && !model.reading.isContentEditing}
      className={`${model.surfaceClassName}${itemEditing ? ' companion-item-editing' : ''}`}
      style={pagedStyle}
      onClick={model.reading.handleSurfaceClick}
      onPointerDown={model.handleSurfacePointerDown}
      onPointerMove={model.handleSurfacePointerMove}
      onPointerUp={model.openToolbarFromArticlePointer}
      onPointerCancel={model.reading.handleSurfacePointerCancel}
      onScroll={scrollPosition.handleScroll}
      onTouchMove={model.closeToolbarFromArticleTouch}
      ref={scrollPosition.surfaceRef}
    >
      <ImmersiveArticleChrome articleProps={{ ...props, onExit }} model={model} readingTypography={readingTypography} />
      {props.flow ? <CompanionReviewHeader>{props.header}</CompanionReviewHeader> : props.header}
      <ImmersiveArticleContent
        layout={props.flow ? 'review' : 'article'}
        isContentEditing={model.reading.isContentEditing}
        onEditorReady={model.toolbar.handleEditorReady}
        readableArticle={pendingReadableArticle.readableArticle}
        readingTypographySettings={readingTypography.settings}
        readingRestoreCommandId={model.reading.readingRestoreCommandId}
        readingSelection={model.reading.readingSelection}
        {...definedProps({
          activity: props.activity, answer: props.answer, isReviewItem: props.isReviewItem,
          onAttachmentResourceSynced: props.onAttachmentResourceSynced,
          onSaveArticleContent: props.onSaveArticleContent,
          syncEndpointUrl: props.syncEndpointUrl
        })}
      />
      <>{model.reading.isContentEditing ? null : <>{props.endOfArticleAction}{props.footer}</>}</>
      <CompanionArticleSelectionLayer articleProps={props} toolbar={model.toolbar} pending={pendingReadableArticle} />
    </section>
  );
}
