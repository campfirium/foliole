import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { CompanionDocumentSearchSheet } from './CompanionDocumentSearchSheet';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { ReadingChrome } from './CompanionReadingChrome';
import {
  ReadingActionsSheet,
  OutlineSheet,
  ReadingFontSheet,
  ReadingHighlightSheet,
  ReadingInfoSheet
} from './CompanionReadingSheets';
import {
  CompanionSelectionAnnotationToolbar,
  type CompanionSelectionAnnotationKind,
  type CompanionSelectionAnnotationToolbarState
} from './CompanionSelectionAnnotationToolbar';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
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
  onSaveArticleContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  snapshot: WorkspaceSnapshot | null;
  syncEndpointUrl?: string | null;
}

function ReadingSheetsLayer(props: {
  editor: EditorAdapter | null;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onOpenSearchSheet(open: boolean): void;
  onOpenOutline(open: boolean): void;
  onSelectOutlineItem(item: { from: number; to: number }): void;
  openReadingSheet: 'font' | 'highlight' | 'info' | null;
  searchOpen: boolean;
  outlineOpen: boolean;
  readableArticle: ReadableArticle;
}) {
  return (
    <>
      <OutlineSheet
        content={props.readableArticle.content}
        onOpenChange={props.onOpenOutline}
        onSelect={props.onSelectOutlineItem}
        open={props.outlineOpen}
      />
      <ReadingFontSheet onOpenChange={(open) => props.onOpenReadingSheet(open ? 'font' : null)} open={props.openReadingSheet === 'font'} />
      <ReadingHighlightSheet onOpenChange={(open) => props.onOpenReadingSheet(open ? 'highlight' : null)} open={props.openReadingSheet === 'highlight'} />
      <ReadingInfoSheet
        hasPdf={Boolean(props.readableArticle.pdfAttachmentId)}
        onOpenChange={(open) => props.onOpenReadingSheet(open ? 'info' : null)}
        open={props.openReadingSheet === 'info'}
        title={props.readableArticle.title}
      />
      <CompanionDocumentSearchSheet
        content={props.readableArticle.content}
        editor={props.editor}
        onOpenChange={props.onOpenSearchSheet}
        open={props.searchOpen}
      />
    </>
  );
}

function ImmersiveChromeLayer(props: {
  actionsOpen: boolean;
  editor: EditorAdapter | null;
  onExit(): void;
  onFindInDocument(): void;
  onOpenActions(open: boolean): void;
  onOpenOutline(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onOpenSearchSheet(open: boolean): void;
  onSelectOutlineItem(item: { from: number; to: number }): void;
  openReadingSheet: 'font' | 'highlight' | 'info' | null;
  outlineOpen: boolean;
  readableArticle: ReadableArticle;
  searchOpen: boolean;
}) {
  return (
    <>
      <ReadingChrome
        onExit={props.onExit}
        onOpenActions={() => props.onOpenActions(true)}
        onOpenOutline={() => props.onOpenOutline(true)}
        onOpenSheet={props.onOpenReadingSheet}
        title={props.readableArticle.title}
      />
      <ReadingActionsSheet
        onFindInDocument={props.onFindInDocument}
        onOpenChange={props.onOpenActions}
        open={props.actionsOpen}
      />
      <ReadingSheetsLayer
        editor={props.editor}
        onOpenOutline={props.onOpenOutline}
        onOpenReadingSheet={props.onOpenReadingSheet}
        onOpenSearchSheet={props.onOpenSearchSheet}
        onSelectOutlineItem={props.onSelectOutlineItem}
        openReadingSheet={props.openReadingSheet}
        searchOpen={props.searchOpen}
        outlineOpen={props.outlineOpen}
        readableArticle={props.readableArticle}
      />
    </>
  );
}

function ImmersiveArticleContent(props: {
  onAttachmentResourceSynced?: () => void;
  onEditorReady(adapter: EditorAdapter | null): void;
  onSaveArticleContent?: (nodeId: string, content: string) => Promise<void>;
  readableArticle: ReadableArticle;
  readingSelection: EditorSelection | null;
  syncEndpointUrl?: string | null;
}) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[760px]">
      <ReadableArticleDocument
        onAttachmentResourceSynced={props.onAttachmentResourceSynced}
        onEditorReady={props.onEditorReady}
        onSaveContent={props.onSaveArticleContent}
        readableArticle={props.readableArticle}
        readingSelection={props.readingSelection}
        syncEndpointUrl={props.syncEndpointUrl}
      />
    </div>
  );
}

function SelectionAnnotationToolbarLayer(props: {
  onAddExistingHighlightNote?: (nodeId: string, originalText: string, note: string) => Promise<string | null> | string | null;
  onClose(): void;
  onCreateSelectionAnnotation?: (
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) => Promise<string | null> | string | null;
  onDeleteExistingHighlight?: (nodeId: string) => Promise<string | null> | string | null;
  resolveSelectionPayload: () => SelectionCommandPayload | null;
  state: CompanionSelectionAnnotationToolbarState | null;
}) {
  return (
    <CompanionSelectionAnnotationToolbar
      onAddExistingHighlightNote={async (nodeId, originalText, note) => {
        await props.onAddExistingHighlightNote?.(nodeId, originalText, note);
      }}
      onApply={async (kind, payload, note) => {
        await props.onCreateSelectionAnnotation?.(kind, payload, note);
      }}
      onClose={props.onClose}
      onDeleteExistingHighlight={async (nodeId) => {
        await props.onDeleteExistingHighlight?.(nodeId);
      }}
      resolveSelectionPayload={props.resolveSelectionPayload}
      state={props.state}
    />
  );
}

export function ImmersiveReadableArticle(props: ImmersiveReadableArticleProps) {
  const toolbar = useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: Boolean(props.onCreateSelectionAnnotation),
    nodeId: props.readableArticle.nodeId,
    snapshot: props.snapshot
  });
  const reading = useImmersiveReadableArticleState(toolbar.closeSelectionToolbar);
  return (
    <section
      className="fixed inset-0 z-30 overflow-y-auto bg-companion-base px-6 pb-20 pt-6 text-foreground sm:px-7"
      onClick={reading.handleSurfaceClick}
      onPointerDown={toolbar.closeSelectionToolbar}
      onPointerMove={toolbar.closeSelectionToolbar}
      onPointerUp={toolbar.openSelectionToolbar}
      onTouchMove={toolbar.closeSelectionToolbar}
    >
      {reading.isChromeVisible ? (
        <ImmersiveChromeLayer
          actionsOpen={reading.isActionsSheetOpen}
          editor={toolbar.editorRef.current}
          onExit={props.onExit}
          onFindInDocument={reading.openDocumentSearch}
          onOpenActions={reading.setIsActionsSheetOpen}
          onOpenOutline={reading.setIsOutlineOpen}
          onOpenReadingSheet={reading.setOpenReadingSheet}
          onOpenSearchSheet={reading.setIsSearchSheetOpen}
          onSelectOutlineItem={reading.handleSelectOutlineItem}
          openReadingSheet={reading.openReadingSheet}
          outlineOpen={reading.isOutlineOpen}
          readableArticle={props.readableArticle}
          searchOpen={reading.isSearchSheetOpen}
        />
      ) : null}
      <ImmersiveArticleContent
        onAttachmentResourceSynced={props.onAttachmentResourceSynced}
        onEditorReady={toolbar.handleEditorReady}
        onSaveArticleContent={props.onSaveArticleContent}
        readableArticle={props.readableArticle}
        readingSelection={reading.readingSelection}
        syncEndpointUrl={props.syncEndpointUrl}
      />
      <SelectionAnnotationToolbarLayer
        onAddExistingHighlightNote={props.onAddExistingHighlightNote}
        onClose={toolbar.clearSelectionAndCloseToolbar}
        onCreateSelectionAnnotation={props.onCreateSelectionAnnotation}
        onDeleteExistingHighlight={props.onDeleteExistingHighlight}
        resolveSelectionPayload={toolbar.resolveSelectionPayload}
        state={toolbar.selectionToolbar}
      />
    </section>
  );
}
