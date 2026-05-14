import { ArrowLeftRight, RotateCwSquare, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AppIconButton } from '../../shared/ui';

const PDF_ZOOM_OPTIONS = [100, 125, 150, 175, 200];

interface ZoomControlsProps {
  onRotateClockwise: () => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

function createToolbarAction(handler: () => void, onToolbarInteraction: () => void) {
  return () => {
    onToolbarInteraction();
    handler();
  };
}

function PdfZoomValueButton(props: {
  isMenuOpen: boolean;
  onToolbarInteraction: () => void;
  setIsMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  zoom: number;
}) {
  return (
    <button
      aria-expanded={props.isMenuOpen}
      aria-haspopup="menu"
      aria-label="Set zoom level"
      className="inline-flex min-h-8 min-w-14 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-2 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => {
        props.onToolbarInteraction();
        props.setIsMenuOpen((current) => !current);
      }}
      type="button"
    >
      <span aria-live="polite" data-testid="pdf-zoom-value">
        {`${props.zoom}%`}
      </span>
    </button>
  );
}

function PdfZoomMenu(props: {
  isMenuOpen: boolean;
  onSetZoom: (value: number) => void;
  onToolbarInteraction: () => void;
  setIsMenuOpen: (value: boolean) => void;
}) {
  if (!props.isMenuOpen) {
    return null;
  }

  return (
    <div className="absolute left-1/2 top-full z-surface-raised mt-2 flex min-w-20 -translate-x-1/2 flex-col rounded-xl border border-border bg-bg-elevated p-1 shadow-popover" role="menu">
      {PDF_ZOOM_OPTIONS.map((option) => (
        <button
          className="min-h-8 rounded-lg px-3 text-left text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          key={option}
          onClick={() => {
            props.onToolbarInteraction();
            props.onSetZoom(option);
            props.setIsMenuOpen(false);
          }}
          role="menuitem"
          type="button"
        >
          {option}%
        </button>
      ))}
    </div>
  );
}

export function PdfZoomControls(props: ZoomControlsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  return (
    <div className="relative flex items-center gap-1" ref={menuRef}>
      <AppIconButton className="size-8" icon={<ZoomOut aria-hidden="true" size={15} strokeWidth={2.1} />} label="Zoom out" onClick={createToolbarAction(props.onZoomOut, props.onToolbarInteraction)} />
      <PdfZoomValueButton
        isMenuOpen={isMenuOpen}
        onToolbarInteraction={props.onToolbarInteraction}
        setIsMenuOpen={setIsMenuOpen}
        zoom={props.zoom}
      />
      <PdfZoomMenu
        isMenuOpen={isMenuOpen}
        onSetZoom={props.onSetZoom}
        onToolbarInteraction={props.onToolbarInteraction}
        setIsMenuOpen={setIsMenuOpen}
      />
      <AppIconButton className="size-8" icon={<ZoomIn aria-hidden="true" size={15} strokeWidth={2.1} />} label="Zoom in" onClick={createToolbarAction(props.onZoomIn, props.onToolbarInteraction)} />
      <AppIconButton className="size-8" icon={<ArrowLeftRight aria-hidden="true" size={15} strokeWidth={2.1} />} label="Fit width" onClick={createToolbarAction(props.onSetFitWidth, props.onToolbarInteraction)} />
      <div className="h-5 w-px bg-border/40" />
      <AppIconButton
        className="size-8"
        icon={<RotateCwSquare aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Rotate page clockwise"
        onClick={createToolbarAction(props.onRotateClockwise, props.onToolbarInteraction)}
      />
    </div>
  );
}
