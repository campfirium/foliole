import type { MouseEvent as ReactMouseEvent } from 'react';
import { useRef, useState } from 'react';

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
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

import type { EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

interface ImmersiveReadableArticleProps {
  onAttachmentResourceSynced?: () => void;
  onExit(): void;
  readableArticle: ReadableArticle;
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
  readableArticle: ReadableArticle;
  readingSelection: EditorSelection | null;
  syncEndpointUrl?: string | null;
}) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[760px]">
      <ReadableArticleDocument
        onAttachmentResourceSynced={props.onAttachmentResourceSynced}
        onEditorReady={props.onEditorReady}
        readableArticle={props.readableArticle}
        readingSelection={props.readingSelection}
        syncEndpointUrl={props.syncEndpointUrl}
      />
    </div>
  );
}

export function ImmersiveReadableArticle(props: ImmersiveReadableArticleProps) {
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isActionsSheetOpen, setIsActionsSheetOpen] = useState(false);
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);
  const [openReadingSheet, setOpenReadingSheet] = useState<'font' | 'highlight' | 'info' | null>(null);
  const [readingSelection, setReadingSelection] = useState<EditorSelection | null>(null);
  const editorRef = useRef<EditorAdapter | null>(null);
  function handleSurfaceClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) {
      return;
    }
    setIsChromeVisible(true);
  }
  function handleSelectOutlineItem(item: { from: number; to: number }) {
    setReadingSelection({ from: item.from, to: item.to });
    setIsOutlineOpen(false);
  }
  function openDocumentSearch() {
    setIsActionsSheetOpen(false);
    setIsSearchSheetOpen(true);
  }
  return (
    <section
      className="fixed inset-0 z-30 overflow-y-auto bg-companion-base px-6 pb-20 pt-6 text-foreground sm:px-7"
      onClick={handleSurfaceClick}
    >
      {isChromeVisible ? (
        <ImmersiveChromeLayer
          actionsOpen={isActionsSheetOpen}
          editor={editorRef.current}
          onExit={props.onExit}
          onFindInDocument={openDocumentSearch}
          onOpenActions={setIsActionsSheetOpen}
          onOpenOutline={setIsOutlineOpen}
          onOpenReadingSheet={setOpenReadingSheet}
          onOpenSearchSheet={setIsSearchSheetOpen}
          onSelectOutlineItem={handleSelectOutlineItem}
          openReadingSheet={openReadingSheet}
          outlineOpen={isOutlineOpen}
          readableArticle={props.readableArticle}
          searchOpen={isSearchSheetOpen}
        />
      ) : null}
      <ImmersiveArticleContent
        onAttachmentResourceSynced={props.onAttachmentResourceSynced}
        onEditorReady={(adapter) => { editorRef.current = adapter; }}
        readableArticle={props.readableArticle}
        readingSelection={readingSelection}
        syncEndpointUrl={props.syncEndpointUrl}
      />
    </section>
  );
}
