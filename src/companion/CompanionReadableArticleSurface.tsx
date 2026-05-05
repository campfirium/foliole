import { Highlighter, Info, ListTree, Search, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useState } from 'react';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import {
  OutlineSheet,
  ReadingFontSheet,
  ReadingHighlightSheet,
  ReadingInfoSheet
} from './CompanionReadingSheets';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

import type { EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import { SimplePdfDocument } from '@/features/pdf/components/SimplePdfDocument';
import { AppButton } from '@/shared/ui';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;

function ReadingChromeButton(props: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-disabled={props.disabled ? 'true' : undefined}
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-companion-content/90 text-companion-text-secondary shadow-panel transition hover:bg-companion-subtle hover:text-foreground disabled:text-companion-text-tertiary"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function ReadableArticleDocument(props: {
  readingSelection?: EditorSelection | null;
  readableArticle: ReadableArticle;
}) {
  const [isViewingPdfOriginal, setIsViewingPdfOriginal] = useState(false);
  const pdfAttachmentId = props.readableArticle.pdfAttachmentId;

  if (pdfAttachmentId && isViewingPdfOriginal) {
    return <SimplePdfDocument attachmentId={pdfAttachmentId} onBackToText={() => setIsViewingPdfOriginal(false)} title={props.readableArticle.title} />;
  }
  if (props.readableArticle.bodyStatus && props.readableArticle.bodyStatus !== 'ready') {
    return <CompanionArticleBodyStatusFallback bodyStatus={props.readableArticle.bodyStatus} />;
  }

  return (
    <>
      {pdfAttachmentId ? (
        <div className="mb-3 flex items-center justify-between border-b border-companion-divider px-1 pb-3">
          <span className="text-xs text-companion-text-secondary">Text version</span>
          <AppButton onClick={() => setIsViewingPdfOriginal(true)} variant="ghost">
            Open PDF
          </AppButton>
        </div>
      ) : null}
      <CompanionArticleDocument
        content={props.readableArticle.content}
        hideTitleHeading={props.readableArticle.hideTitleHeading}
        nodeId={props.readableArticle.nodeId}
        readingSelection={props.readingSelection}
        readingTargetViewportMode="center"
        textAnchorDecorations={props.readableArticle.textAnchorDecorations}
      />
    </>
  );
}

function ReadingChrome(props: {
  onExit(): void;
  onOpenOutline(): void;
  onOpenSheet(sheet: 'font' | 'highlight' | 'info'): void;
  onSearch(): void;
  title: string;
}) {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 bg-companion-base/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center gap-2">
          <ReadingChromeButton icon={X} label="Exit" onClick={props.onExit} />
          <ReadingChromeButton icon={ListTree} label="Outline" onClick={props.onOpenOutline} />
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
            {props.title}
          </span>
          <ReadingChromeButton icon={SlidersHorizontal} label="Font" onClick={() => props.onOpenSheet('font')} />
          <ReadingChromeButton icon={Highlighter} label="Highlight" onClick={() => props.onOpenSheet('highlight')} />
          <ReadingChromeButton icon={Info} label="Info" onClick={() => props.onOpenSheet('info')} />
        </div>
      </div>
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
        <ReadingChromeButton icon={Search} label="Search" onClick={props.onSearch} />
      </div>
    </>
  );
}

function ReadingSheetsLayer(props: {
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onOpenOutline(open: boolean): void;
  onSelectOutlineItem(item: { from: number; to: number }): void;
  openReadingSheet: 'font' | 'highlight' | 'info' | null;
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
    </>
  );
}

export function ImmersiveReadableArticle(props: {
  onExit(): void;
  onSearch(): void;
  readableArticle: ReadableArticle;
}) {
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [openReadingSheet, setOpenReadingSheet] = useState<'font' | 'highlight' | 'info' | null>(null);
  const [readingSelection, setReadingSelection] = useState<EditorSelection | null>(null);
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

  return (
    <section
      className="fixed inset-0 z-30 overflow-y-auto bg-companion-base px-6 pb-20 pt-6 text-foreground sm:px-7"
      onClick={handleSurfaceClick}
    >
      {isChromeVisible ? (
        <>
          <ReadingChrome
            onExit={props.onExit}
            onOpenOutline={() => setIsOutlineOpen(true)}
            onOpenSheet={setOpenReadingSheet}
            onSearch={props.onSearch}
            title={props.readableArticle.title}
          />
          <ReadingSheetsLayer
            onOpenOutline={setIsOutlineOpen}
            onOpenReadingSheet={setOpenReadingSheet}
            onSelectOutlineItem={handleSelectOutlineItem}
            openReadingSheet={openReadingSheet}
            outlineOpen={isOutlineOpen}
            readableArticle={props.readableArticle}
          />
        </>
      ) : null}
      <div className="mx-auto min-h-full w-full max-w-[760px]">
        <ReadableArticleDocument readableArticle={props.readableArticle} readingSelection={readingSelection} />
      </div>
    </section>
  );
}
