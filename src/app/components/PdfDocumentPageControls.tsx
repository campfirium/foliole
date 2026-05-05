import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { AppIconButton, AppInput } from '../../shared/ui';

interface PageControlsProps {
  displayPage: number;
  maxPage: number;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onToolbarInteraction: () => void;
}

function createToolbarAction(handler: () => void, onToolbarInteraction: () => void) {
  return () => {
    onToolbarInteraction();
    handler();
  };
}

function sanitizePageInput(value: string) {
  return value.replace(/\D/g, '');
}

function clampPageInputValue(value: number, maxPage: number) {
  const resolvedMaxPage = Number.isFinite(maxPage) ? Math.max(1, maxPage) : Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(resolvedMaxPage, value));
}

function PdfPageButtons({ canGoNext, canGoPrevious, onNextPage, onPreviousPage, onToolbarInteraction }: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onToolbarInteraction: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <AppIconButton className="size-8" disabled={!canGoPrevious} icon={<ArrowUpToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label="Previous page" onClick={createToolbarAction(onPreviousPage, onToolbarInteraction)} />
      <AppIconButton className="size-8" disabled={!canGoNext} icon={<ArrowDownToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label="Next page" onClick={createToolbarAction(onNextPage, onToolbarInteraction)} />
    </div>
  );
}

export function PdfPageControls({ displayPage, maxPage, onNextPage, onPageChange, onPreviousPage, onToolbarInteraction }: PageControlsProps) {
  const { pageInputValue, handlePageInputBlur, handlePageInputChange, handlePageInputFocus, handlePageInputKeyDown } = usePdfPageInputState({
    displayPage,
    maxPage,
    onPageChange,
    onToolbarInteraction
  });
  const pageCountLabel = Number.isFinite(maxPage) ? maxPage : '--';
  const canGoPrevious = displayPage > 1;
  const canGoNext = Number.isFinite(maxPage) ? displayPage < maxPage : true;

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="pdf-page-input">
        PDF page
      </label>
      <AppInput
        aria-label="PDF page"
        className="h-8 w-14 appearance-none border-transparent bg-transparent px-2 text-center text-sm focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        id="pdf-page-input"
        inputMode="numeric"
        onBlur={handlePageInputBlur}
        onChange={(event) => handlePageInputChange(event.target.value)}
        onFocus={handlePageInputFocus}
        onKeyDown={handlePageInputKeyDown}
        pattern="[0-9]*"
        type="text"
        value={pageInputValue}
      />
      <p className="min-w-16 text-xs text-foreground/55" data-testid="pdf-page-count">
        / {pageCountLabel}
      </p>
      <PdfPageButtons
        canGoNext={canGoNext}
        canGoPrevious={canGoPrevious}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        onToolbarInteraction={onToolbarInteraction}
      />
    </div>
  );
}

function usePdfPageInputState(args: {
  displayPage: number;
  maxPage: number;
  onPageChange: (value: number) => void;
  onToolbarInteraction: () => void;
}) {
  const [pageInputValue, setPageInputValue] = useState(() => String(args.displayPage));
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);
  const [pendingCommittedPageValue, setPendingCommittedPageValue] = useState<string | null>(null);

  useEffect(() => {
    if (isEditingPageInput) {
      return;
    }
    if (pendingCommittedPageValue !== null) {
      if (pendingCommittedPageValue === String(args.displayPage)) {
        setPendingCommittedPageValue(null);
      } else {
        setPageInputValue(pendingCommittedPageValue);
        return;
      }
    }
    setPageInputValue(String(args.displayPage));
  }, [args.displayPage, isEditingPageInput, pendingCommittedPageValue]);

  const commitPageInputValue = () => {
    setIsEditingPageInput(false);
    const digitsOnly = sanitizePageInput(pageInputValue);
    if (!digitsOnly) {
      setPendingCommittedPageValue(null);
      setPageInputValue(String(args.displayPage));
      return;
    }
    const nextPage = clampPageInputValue(Number(digitsOnly), args.maxPage);
    const nextPageValue = String(nextPage);
    setPendingCommittedPageValue(nextPageValue);
    setPageInputValue(nextPageValue);
    args.onToolbarInteraction();
    args.onPageChange(nextPage);
  };

  return {
    handlePageInputBlur: commitPageInputValue,
    handlePageInputChange: (value: string) => {
      setIsEditingPageInput(true);
      setPendingCommittedPageValue(null);
      setPageInputValue(sanitizePageInput(value));
    },
    handlePageInputFocus: () => setIsEditingPageInput(true),
    handlePageInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      commitPageInputValue();
    },
    pageInputValue
  };
}
