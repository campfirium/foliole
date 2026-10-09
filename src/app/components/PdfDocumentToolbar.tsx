import { useEffect, useRef, useState } from 'react';

import { usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { appFloatingToolbarClassName } from '../../shared/ui';

import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfPageControls, PdfSearchControls, PdfZoomControls } from './PdfDocumentToolbarControls';
import { PdfReadingViewControls } from './PdfReadingViewControls';
import { PdfTopBarsToggle } from './PdfTopBarsToggle';
import { PdfVisualExcerptToolbarControls } from './PdfVisualExcerptToolbarControls';

interface PdfDocumentToolbarProps {
  displayPage: number;
  isVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

function resolveToolbarShellClassName() {
  return 'sticky top-0 z-floating h-0 w-full px-4 pt-3 pointer-events-none';
}

function resolveToolbarPanelClassName(isVisible: boolean) {
  const visibilityClassName = isVisible
    ? 'translate-y-0 opacity-100'
    : '-translate-y-3 opacity-0 pointer-events-none';
  return appFloatingToolbarClassName(visibilityClassName);
}

function ToolbarDivider() {
  return <div className="h-5 w-px bg-border/30" />;
}

function useToolbarActivity(
  onToolbarActiveChange: PdfDocumentToolbarProps['onToolbarActiveChange'],
  revealHovered: boolean
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  useEffect(() => {
    if (!isMenuOpen) setIsFocused(panelRef.current?.contains(document.activeElement) ?? false);
  }, [isMenuOpen]);
  const active = revealHovered || isHovered || isFocused || isMenuOpen;
  useEffect(() => onToolbarActiveChange(active), [active, onToolbarActiveChange]);
  return { panelRef, setIsHovered, setIsFocused, setIsMenuOpen };
}

export function PdfDocumentToolbar(props: PdfDocumentToolbarProps) {
  const topBars = usePdfTopBars();
  const { panelRef, setIsHovered, setIsFocused, setIsMenuOpen } = useToolbarActivity(
    props.onToolbarActiveChange, topBars.revealHovered
  );
  return (
    <div
      className={resolveToolbarShellClassName()}
      style={{ top: topBars.floating && topBars.visible ? 'calc(var(--workspace-top-toolbar-height) + 32px)' : undefined }}
      data-testid="pdf-document-toolbar"
      data-toolbar-visible={props.isVisible ? 'true' : 'false'}
    >
      <div
        className={`absolute inset-x-0 h-3 pointer-events-auto ${topBars.floating && !topBars.visible ? 'top-3' : 'top-0'}`}
        data-testid="pdf-toolbar-reveal-zone"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <div
        className={resolveToolbarPanelClassName(props.isVisible)}
        ref={panelRef}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget instanceof Node ? event.relatedTarget : null
            )
          ) {
            setIsFocused(false);
          }
        }}
        onFocusCapture={() => setIsFocused(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {renderViewControls(props, setIsMenuOpen)}
        <PdfTopBarsToggle onInteraction={props.onToolbarInteraction} />
        <ToolbarDivider />
        <PdfPageControls
          displayPage={props.displayPage}
          maxPage={props.maxPage}
          onNextPage={props.onNextPage}
          onPageChange={props.onPageChange}
          onPreviousPage={props.onPreviousPage}
          onToolbarInteraction={props.onToolbarInteraction}
        />
        <ToolbarDivider />
        <PdfVisualExcerptToolbarControls onToolbarInteraction={props.onToolbarInteraction} />
        <ToolbarDivider />
        {renderSearchControls(props)}
      </div>
    </div>
  );
}

function renderViewControls(
  props: PdfDocumentToolbarProps,
  setIsMenuOpen: (open: boolean) => void
) {
  return (
    <>
      <PdfZoomControls
        onMenuOpenChange={setIsMenuOpen}
        onRotateClockwise={props.onRotateClockwise}
        onSetFitWidth={props.onSetFitWidth}
        onSetZoom={props.onSetZoom}
        onToolbarInteraction={props.onToolbarInteraction}
        onZoomIn={props.onZoomIn}
        onZoomOut={props.onZoomOut}
        zoomMode={props.zoomMode}
        zoom={props.zoom}
      />
      <PdfReadingViewControls onInteraction={props.onToolbarInteraction} onMenuOpenChange={setIsMenuOpen} />
    </>
  );
}

function renderSearchControls(props: PdfDocumentToolbarProps) {
  return (
    <PdfSearchControls
      onClearSearch={props.onClearSearch}
      onFindNext={props.onFindNext}
      onFindPrevious={props.onFindPrevious}
      onSearchFocusChange={props.onSearchFocusChange}
      onSearchQueryChange={props.onSearchQueryChange}
      onToolbarInteraction={props.onToolbarInteraction}
      searchIndexingHint={props.searchIndexingHint}
      searchQuery={props.searchQuery}
      searchStatus={props.searchStatus}
    />
  );
}
