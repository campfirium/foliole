import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

import { appFloatingSurfaceClassName, settingsColorSwatchClassName, settingsPaletteButtonClassName, settingsUtilityIconButtonClassName } from '../../../../shared/ui';

import { cn } from '@/shared/lib/utils';

export type ThemeFavoritesPopoverPosition = {
  left: number;
  top: number;
  width: number;
};

function isSamePalette(left: string[], right: string[]) {
  return left.length === right.length && left.every((color, index) => color === right[index]);
}

function PaletteStrip(props: { palette: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className={settingsColorSwatchClassName('size-7')}
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function FavoritesEmptyState() {
  return <div className="py-6 text-center text-sm text-foreground/52">No saved themes yet.</div>;
}

function FavoritePaletteCard(props: {
  currentPalette: string[];
  index: number;
  onApplyFavorite: (palette: string[]) => void;
  onRemoveFavorite: (palette: string[]) => void;
  palette: string[];
}) {
  return (
    <div className="group flex items-center gap-1">
      <button
        aria-label={`Apply favorite theme ${props.index + 1}`}
        className={settingsPaletteButtonClassName(isSamePalette(props.palette, props.currentPalette))}
        onClick={() => props.onApplyFavorite(props.palette)}
        type="button"
      >
        <PaletteStrip palette={props.palette} />
      </button>
      <button
        aria-label={`Remove favorite theme ${props.index + 1}`}
        className={settingsUtilityIconButtonClassName(false, 'size-7 rounded-sm px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        onClick={(event) => {
          event.stopPropagation();
          props.onRemoveFavorite(props.palette);
        }}
        type="button"
      >
        <X aria-hidden="true" size={14} strokeWidth={1.9} />
      </button>
    </div>
  );
}

function FavoritesGrid(props: {
  currentPalette: string[];
  favorites: string[][];
  onApplyFavorite: (palette: string[]) => void;
  onRemoveFavorite: (palette: string[]) => void;
}) {
  return (
    <div className="flex max-h-[min(420px,60vh)] flex-wrap gap-1.5 overflow-y-auto pr-1">
      {props.favorites.map((palette, index) => (
        <FavoritePaletteCard
          currentPalette={props.currentPalette}
          index={index}
          key={`${palette.join('-')}-${index}`}
          onApplyFavorite={props.onApplyFavorite}
          onRemoveFavorite={props.onRemoveFavorite}
          palette={palette}
        />
      ))}
    </div>
  );
}

export function WorkspaceSurfaceThemeFavoritesPopover(props: {
  currentPalette: string[];
  favorites: string[][];
  onApplyFavorite: (palette: string[]) => void;
  onClose: () => void;
  onRemoveFavorite: (palette: string[]) => void;
  position: ThemeFavoritesPopoverPosition;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panelRef.current?.contains(target) || props.triggerRef.current?.contains(target)) {
        return;
      }
      props.onClose();
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    return () => document.removeEventListener('mousedown', handlePointerDown, true);
  }, [props.onClose, props.triggerRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      aria-label="Theme collection panel"
      className={cn(appFloatingSurfaceClassName('panel'), 'fixed z-panel-popover p-4 pointer-events-auto')}
      ref={panelRef}
      style={{ left: props.position.left, top: props.position.top, width: props.position.width }}
    >
      {props.favorites.length > 0 ? (
        <FavoritesGrid
          currentPalette={props.currentPalette}
          favorites={props.favorites}
          onApplyFavorite={(palette) => {
            props.onApplyFavorite(palette);
            props.onClose();
          }}
          onRemoveFavorite={props.onRemoveFavorite}
        />
      ) : (
        <FavoritesEmptyState />
      )}
    </div>,
    document.body
  );
}
