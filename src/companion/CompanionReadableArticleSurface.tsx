import { useEffect, type ReactNode } from 'react';

import { getPdfAnchorLocators } from '../../lib/core/anchors/pdfAnchorLocator';
import type { StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveTextAnchorLocatorsInContent } from '../features/nodes/model/textAnchorResolution';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';
import { canCreateSelectionAnnotation } from '../shared/selectionAnnotationEligibility';

import { CompanionArticleSelectionLayer } from './CompanionArticleSelectionLayer';
import { createArticleToolbarEvents } from './companionArticleToolbarEvents';
import { useCompanionArticleExit } from './CompanionArticleTransition';
import type { CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import { findCompanionClozeTarget } from './companionExistingHighlightActions';
import type { CompanionHighlightRangeHandler } from './companionHighlightRangePersistence';
import { ImmersiveArticleContent } from './CompanionImmersiveArticleContent';
import { CompanionPdfResumeNotice } from './CompanionPdfResumeNotice';
import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionReadingDisplayLayout } from './companionReadingDisplayLayout';
import { CompanionReadingSession } from './CompanionReadingSession';
import { CompanionReviewHeader } from './CompanionReviewHeader';
import { resolveCompanionSearchSelection, type CompanionSearchMatch } from './companionSearchMatch';
import { type CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { useCompanionToolbarAppearance } from './companionSelectionToolbarPreference';
import { getDefaultSelectionClientPoint, resolveExistingHighlightToolbarState } from './companionSelectionToolbarState';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionContentEditingActions } from './useCompanionContentEditingActions';
import { useCompanionAnchoredEditorReady, useCompanionArticleEditScroll, type CompanionEditToggleScrollAnchor } from './useCompanionEditToggleScrollAnchor';
import { useCompanionItemEditViewport } from './useCompanionItemEditViewport';
import { useCompanionNodeTextAlternative } from './useCompanionNodeTextAlternative';
import { useCompanionPagedScroll } from './useCompanionPagedScroll';
import { useCompanionPdfTextScroll } from './useCompanionPdfTextScroll';
import { useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import { useCompanionReadableAndroidBack } from './useCompanionReadableAndroidBack';
import type { CompanionReadingNavigationControls } from './useCompanionReadingNavigation';
import { useCompanionReadingSelectionViewport } from './useCompanionReadingSelectionViewport';
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
  breadcrumbAnchor?: StoredAnchorLink | null;
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
  onOpenBacklinkNode?: ((nodeId: string) => void) | undefined;
  onReturnFromBacklink?: (() => void) | undefined;
  onOpenExistingHighlight?: ((nodeId: string) => void) | undefined;
  onBack?: () => void;
  onExit(): void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  onSaveArticleContent?: CompanionContentSaveHandler;
  onScrollTopChange?: (scrollTop: number, pdf?: import('../shared/platform/companion/reading/saveCompanionPdfTextPosition').CompanionPdfPageUpdate) => void;
  readableArticle: ReadableArticle;
  snapshot: WorkspaceSnapshot | null;
  syncEndpointUrl?: string | null;
}

function useImmersiveReadableArticleModel(props: ImmersiveReadableArticleProps, scrollAnchor: CompanionEditToggleScrollAnchor) {
  const { breadcrumbAnchor, readableArticle: { content } } = props;
  const locator = breadcrumbAnchor?.locator;
  const anchor = locator && getPdfAnchorLocators(locator).length === 0
    ? resolveTextAnchorLocatorsInContent(content, locator)?.[0] : undefined;
  const reading = useImmersiveReadableArticleState(
    anchor ? { from: anchor.from, to: anchor.from } : resolveCompanionSearchSelection(content, props.searchMatch),
    anchor ? 'companion-breadcrumb-anchor' : undefined
  );
  const snapshot = props.snapshot;
  const toolbarAppearance = useCompanionToolbarAppearance();
  const toolbar = useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: toolbarAppearance.selectionToolbarEnabled && Boolean(props.onCreateSelectionAnnotation) &&
      canCreateSelectionAnnotation(snapshot?.nodesById[props.readableArticle.nodeId]) && !reading.isContentEditing,
    nodeId: props.readableArticle.nodeId,
    snapshot
  });
  useEffect(() => {
    if (reading.isContentEditing) toolbar.editorRef.current?.focus();
  }, [reading.isContentEditing, toolbar.editorRef]);
  const { cancelContentEditing, toggleContentEditing } = useCompanionContentEditingActions({
    activity: props.activity, // An answered review item edits in its own viewport, which starts from the top.
    captureScrollAnchor: next => { if (props.isReviewItem !== true || props.answer == null) scrollAnchor.capture(toolbar.editorRef.current, next); },
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
    exit: props.onBack ?? props.onExit,
    returnFromBacklink: props.onReturnFromBacklink
  });
  function selectOutlineItem(item: { from: number; to: number }) {
    reading.handleSelectOutlineItem(item);
    toolbar.clearSelectionAndCloseToolbar();
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
      onOpenBacklinkNode={articleProps.onOpenBacklinkNode}
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
function useReadableArticleViewport(props: ImmersiveReadableArticleProps,
  model: ReturnType<typeof useImmersiveReadableArticleModel>,
  pendingReadableArticle: ReturnType<typeof useCompanionPendingReadableArticle<ReadableArticle>>,
  { scrollAnchor, scrollPosition }: ReturnType<typeof useCompanionArticleEditScroll>) {
  const onEditorReady = useCompanionAnchoredEditorReady(model.toolbar.handleEditorReady, scrollAnchor);
  const itemEditing = model.reading.isContentEditing && props.isReviewItem === true && props.answer != null;
  useCompanionItemEditViewport(scrollPosition.surfaceRef, itemEditing);
  const pagedStyle = useCompanionPagedScroll(scrollPosition.surfaceRef, model.reading.isContentEditing);
  const pdfScroll = useCompanionPdfTextScroll({ article: pendingReadableArticle.readableArticle,
    editing: model.reading.isContentEditing, onEditorReady, surface: scrollPosition.surfaceRef,
    onScrollTopChange: props.onScrollTopChange, jump: { commandId: model.reading.readingRestoreCommandId, selection: model.reading.readingSelection } });
  const bounded = useCompanionReadingSelectionViewport(scrollPosition.surfaceRef, model.reading.isContentEditing,
    model.reading.isChromeVisible, props.header, props.footer);
  return { bounded, itemEditing, pagedStyle, pdfScroll, scrollPosition };
}

export function ImmersiveReadableArticle(props: ImmersiveReadableArticleProps) {
  return <CompanionReadingSession><ReadableArticleReader {...props} /></CompanionReadingSession>;
}

function ReadableArticleReader(props: ImmersiveReadableArticleProps) {
  const exitReader = useCompanionArticleExit(props.onExit);
  // Popping a backlink keeps the reader on screen.
  const onExit = props.onReturnFromBacklink ?? exitReader;
  const onBack = useCompanionArticleExit(props.onBack ?? props.onExit);
  const scroll = useCompanionArticleEditScroll({ nodeId: props.readableArticle.nodeId, external: props.snapshot === null,
    scrollTop: props.readableArticle.persistedNodeViewState?.scrollTop ?? 0, onScrollTopChange: props.onScrollTopChange });
  const model = useImmersiveReadableArticleModel({ ...props, onExit, onBack }, scroll.scrollAnchor);
  const readingTypography = useCompanionReadingTypographySettings();
  const pendingReadableArticle = useCompanionPendingReadableArticle(props.readableArticle);
  const { bounded, itemEditing, pagedStyle, pdfScroll, scrollPosition } = useReadableArticleViewport(props, model, pendingReadableArticle, scroll);
  return (
    <section
      data-reading-selection-viewport={bounded || undefined}
      data-companion-reading-surface="true"
      data-reading-end-action={Boolean(props.endOfArticleAction) && !model.reading.isContentEditing || undefined}
      data-reading-chrome-visible={model.reading.isChromeVisible && !model.reading.isContentEditing}
      className={`${model.surfaceClassName}${itemEditing ? ' companion-item-editing' : ''}`}
      style={pagedStyle}
      onClick={model.handleSurfaceClick}
      onPointerDown={event => {
        if (event.pointerType === 'touch') pdfScroll.markInput();
        model.handleSurfacePointerDown(event);
      }}
      onPointerMove={model.handleSurfacePointerMove}
      onPointerUp={model.openToolbarFromArticlePointer}
      onPointerCancel={model.reading.handleSurfacePointerCancel}
      onScroll={event => { if (!pdfScroll.onScroll(event) && !pdfScroll.hasAccepted() && props.readableArticle.pdfResumeTextOffset === undefined) scrollPosition.handleScroll(event); }}
      onWheelCapture={pdfScroll.markInput}
      onTouchMoveCapture={pdfScroll.markInput}
      onTouchMove={model.closeToolbarFromArticleTouch}
      ref={scrollPosition.surfaceRef}
    >
      <ImmersiveArticleChrome articleProps={{ ...props, onExit }} model={model} readingTypography={readingTypography} />
      {props.header || (props.flow && !bounded) ? <CompanionReviewHeader>{props.header}</CompanionReviewHeader> : null}
      <ImmersiveArticleContent
        layout={props.flow ? 'review' : 'article'}
        isContentEditing={model.reading.isContentEditing}
        onEditorReady={pdfScroll.onEditorReady} onCompleteApplyingReadingPosition={pdfScroll.onJumpSettled}
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
      {pdfScroll.offer && <CompanionPdfResumeNotice {...pdfScroll.offer} />}
      {model.reading.isContentEditing ? null : <>{props.endOfArticleAction}{props.footer}</>}
      <CompanionArticleSelectionLayer articleProps={props} toolbar={model.toolbar} pending={pendingReadableArticle} surface={scrollPosition.surfaceRef.current} />
    </section>
  );
}
