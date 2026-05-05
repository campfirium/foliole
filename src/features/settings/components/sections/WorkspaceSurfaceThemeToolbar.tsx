import { useEffect, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';

import { WorkspaceSurfaceThemeFavoritesPopover, type ThemeFavoritesPopoverPosition } from './WorkspaceSurfaceThemeFavoritesPopover';

import { cn } from '@/shared/lib/utils';

function isSamePalette(left: string[], right: string[]) {
  return left.length === right.length && left.every((color, index) => color === right[index]);
}

function PaletteStrip(props: { palette: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className="block h-7 w-7 rounded-sm border border-border/40"
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function ToolbarTextButton(props: {
  active?: boolean;
  ariaLabel: string;
  label: string;
  onClick: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      className={cn(
        'inline-flex h-7 items-center rounded-sm px-2 text-xs font-medium text-foreground/62 transition-colors hover:bg-foreground/[0.03] hover:text-foreground',
        props.active && 'bg-foreground/[0.05] text-foreground'
      )}
      onClick={props.onClick}
      ref={props.triggerRef}
      type="button"
    >
      {props.label}
    </button>
  );
}

function ThemeHistorySlots(props: {
  currentPalette: string[];
  history: string[][];
  onApplyPalette: (palette: string[]) => void;
}) {
  return (
    <div aria-label="Theme history" className="flex items-center gap-1.5">
      <span className="inline-flex h-7 items-center rounded-sm px-2 text-xs font-medium text-foreground/56">History</span>
      {Array.from({ length: 6 }, (_, index) => {
        const palette = props.history[index];
        const label = `Restore theme history ${index + 1}`;
        return palette ? (
          <button
            aria-label={label}
            className={cn(
              'h-7 w-7 rounded-sm border transition-colors',
              isSamePalette(palette, props.currentPalette) ? 'border-border-strong/80 shadow-sm' : 'border-border/45 hover:border-border/75'
            )}
            key={`${palette.join('-')}-${index}`}
            onClick={() => props.onApplyPalette(palette)}
            style={{ backgroundColor: palette[0] }}
            type="button"
          />
        ) : (
          <span aria-hidden="true" className="block h-7 w-7 rounded-sm border border-dashed border-border/45 bg-bg-elevated/70" key={`empty-${index}`} />
        );
      })}
    </div>
  );
}

function useFavoritesPanelPosition(props: {
  favoritesOpen: boolean;
  toolbarRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [position, setPosition] = useState<ThemeFavoritesPopoverPosition | null>(null);

  useEffect(() => {
    if (!props.favoritesOpen) {
      return undefined;
    }

    const updatePosition = () => {
      const toolbarRect = props.toolbarRef.current?.getBoundingClientRect();
      const triggerRect = props.triggerRef.current?.getBoundingClientRect();
      if (!toolbarRect || !triggerRect) {
        return;
      }
      const maxLeft = Math.max(12, window.innerWidth - toolbarRect.width - 12);
      setPosition({
        left: Math.min(Math.max(toolbarRect.left, 12), maxLeft),
        top: triggerRect.bottom + 10,
        width: toolbarRect.width
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [props.favoritesOpen, props.toolbarRef, props.triggerRef]);

  return position;
}

function ThemeToolbarRow(props: {
  currentPalette: string[];
  favoritesOpen: boolean;
  history: string[][];
  isFavorited: boolean;
  onAddFavorite: () => void;
  onApplyHistory: (palette: string[]) => void;
  onToggleFavorites: () => void;
  toolbarRef: Ref<HTMLDivElement>;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" ref={props.toolbarRef}>
      <PaletteStrip palette={props.currentPalette} />
      <ToolbarTextButton
        active={props.isFavorited}
        ariaLabel={props.isFavorited ? 'Current theme is already in favorites' : 'Add current theme to favorites'}
        label={props.isFavorited ? 'Favorited' : 'Favorite'}
        onClick={props.onAddFavorite}
      />
      <ThemeHistorySlots currentPalette={props.currentPalette} history={props.history} onApplyPalette={props.onApplyHistory} />
      <ToolbarTextButton
        active={props.favoritesOpen}
        ariaLabel="Open theme collection"
        label="Favorites"
        onClick={props.onToggleFavorites}
        triggerRef={props.triggerRef}
      />
    </div>
  );
}

export function WorkspaceSurfaceThemeToolbar(props: {
  currentPalette: string[];
  favorites: string[][];
  history: string[][];
  isFavorited: boolean;
  onAddFavorite: () => void;
  onApplyFavorite: (palette: string[]) => void;
  onApplyHistory: (palette: string[]) => void;
  onRemoveFavorite: (palette: string[]) => void;
}) {
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const favoritesTriggerRef = useRef<HTMLButtonElement | null>(null);
  const panelPosition = useFavoritesPanelPosition({
    favoritesOpen,
    toolbarRef,
    triggerRef: favoritesTriggerRef
  });

  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium text-foreground">Current theme</h4>
      <ThemeToolbarRow
        currentPalette={props.currentPalette}
        favoritesOpen={favoritesOpen}
        history={props.history}
        isFavorited={props.isFavorited}
        onAddFavorite={props.onAddFavorite}
        onApplyHistory={props.onApplyHistory}
        onToggleFavorites={() => setFavoritesOpen((open) => !open)}
        toolbarRef={toolbarRef}
        triggerRef={favoritesTriggerRef}
      />
      {favoritesOpen && panelPosition ? (
        <WorkspaceSurfaceThemeFavoritesPopover
          currentPalette={props.currentPalette}
          favorites={props.favorites}
          onApplyFavorite={props.onApplyFavorite}
          onClose={() => setFavoritesOpen(false)}
          onRemoveFavorite={props.onRemoveFavorite}
          position={panelPosition}
          triggerRef={favoritesTriggerRef}
        />
      ) : null}
    </div>
  );
}
