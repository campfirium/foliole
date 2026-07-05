import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import { type CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionReadingTypographySettings } from './useCompanionReadingTypographySettings';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import { definedProps } from '@/shared/lib/definedProps';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

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
  function toggleContentEditing() {
    if (reading.isContentEditing) {
      reading.exitContentEditing();
      return;
    }
    toolbar.clearSelectionAndCloseToolbar();
    reading.enterContentEditing();
  }
  function selectOutlineItem(item: { from: number; to: number }) {
    reading.handleSelectOutlineItem(item);
    toolbar.closeSelectionToolbar();
  }
  const surfaceClassName = `fixed top-0 right-0 bottom-0 left-0 z-surface-raised overflow-y-auto bg-companion-base px-6 ${reading.isChromeVisible ? 'pt-36 supports-[padding-top:calc(0px)]:[padding-top:calc(env(safe-area-inset-top)+9rem)]' : 'pt-6 supports-[padding-top:max(0px)]:pt-[max(env(safe-area-inset-top),24px)]'} pb-20 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),80px)] text-foreground sm:px-7`;
  return { reading, selectOutlineItem, surfaceClassName, toggleContentEditing, toolbar };
}

export function ImmersiveReadableArticle(props: ImmersiveReadableArticleProps) {
  const model = useImmersiveReadableArticleModel(props);
  const readingTypography = useCompanionReadingTypographySettings();
  return (
    <section
      className={model.surfaceClassName}
      onClick={model.reading.handleSurfaceClick}
      onPointerDown={model.toolbar.closeSelectionToolbar}
      onPointerMove={model.toolbar.closeSelectionToolbar}
      onPointerUp={model.toolbar.openSelectionToolbar}
      onTouchMove={model.toolbar.closeSelectionToolbar}
    >
      {model.reading.isChromeVisible ? (
        <ImmersiveChromeLayer
          actionsOpen={model.reading.isActionsSheetOpen}
          canEditContent={Boolean(props.onSaveArticleContent)}
          editor={model.toolbar.editorRef.current}
          isContentEditing={model.reading.isContentEditing}
          onExit={props.onExit}
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
          readableArticle={props.readableArticle}
          readingTypographySettings={readingTypography.settings}
          searchOpen={model.reading.isSearchSheetOpen}
          {...definedProps({ onRestoreFromTrash: props.onRestoreFromTrash })}
        />
      ) : null}
      <ImmersiveArticleContent
        isContentEditing={model.reading.isContentEditing}
        onEditorReady={model.toolbar.handleEditorReady}
        readableArticle={props.readableArticle}
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
          onCreateSelectionAnnotation: props.onCreateSelectionAnnotation,
          onDeleteExistingHighlight: props.onDeleteExistingHighlight
        })}
      />
    </section>
  );
}
