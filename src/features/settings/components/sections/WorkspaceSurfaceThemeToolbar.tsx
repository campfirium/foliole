import { Library, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';

import { WorkspaceSurfaceThemeFavoritesPopover, type ThemeFavoritesPopoverPosition } from './WorkspaceSurfaceThemeFavoritesPopover';

import { settingsColorSwatchClassName, settingsPaletteButtonClassName, settingsUtilityIconButtonClassName, settingsValueBoxClassName } from '@/shared/ui';

function isSamePalette(left: string[], right: string[]) {
  return left.length === right.length && left.every((color, index) => color === right[index]);
}

function PaletteStrip(props: { palette: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className={settingsColorSwatchClassName('size-8')}
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function IconToggleButton(props: {
  active: boolean;
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      aria-pressed={props.active}
      className={settingsUtilityIconButtonClassName(props.active, 'size-8 rounded-sm px-0')}
      onClick={props.onClick}
      ref={props.triggerRef}
      type="button"
    >
      {props.children}
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
      {Array.from({ length: 5 }, (_, index) => {
        const palette = props.history[index];
        const label = `Restore theme history ${index + 1}`;
        return palette ? (
          <button
            aria-label={label}
            className={settingsPaletteButtonClassName(isSamePalette(palette, props.currentPalette), 'size-8 p-0')}
            key={`${palette.join('-')}-${index}`}
            onClick={() => props.onApplyPalette(palette)}
            style={{ backgroundColor: palette[0] }}
            type="button"
          />
        ) : (
          <span aria-hidden="true" className={settingsValueBoxClassName('block size-8 rounded-sm border-dashed p-0')} key={`empty-${index}`} />
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
  onToggleFavorite: () => void;
  onApplyHistory: (palette: string[]) => void;
  onToggleFavorites: () => void;
  toolbarRef: Ref<HTMLDivElement>;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="space-y-3" ref={props.toolbarRef}>
      <div className="space-y-2 py-1">
        <h4 className="text-sm font-medium text-foreground">Current theme</h4>
        <div className="flex items-center gap-2">
          <PaletteStrip palette={props.currentPalette} />
          <IconToggleButton
            active={props.isFavorited}
            ariaLabel={props.isFavorited ? 'Remove current theme from favorites' : 'Add current theme to favorites'}
            onClick={props.onToggleFavorite}
          >
            <Star aria-hidden="true" className="text-current" fill="none" size={22} strokeWidth={1.8} />
          </IconToggleButton>
          <IconToggleButton
            active={props.favoritesOpen}
            ariaLabel="Open theme collection"
            onClick={props.onToggleFavorites}
            triggerRef={props.triggerRef}
          >
            <Library aria-hidden="true" className="text-current" size={22} strokeWidth={1.8} />
          </IconToggleButton>
        </div>
      </div>
      <div className="space-y-2 border-t border-settings-divider/55 py-3">
        <h4 className="text-sm font-medium text-foreground">History</h4>
        <ThemeHistorySlots currentPalette={props.currentPalette} history={props.history} onApplyPalette={props.onApplyHistory} />
      </div>
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
    <div>
      <ThemeToolbarRow
        currentPalette={props.currentPalette}
        favoritesOpen={favoritesOpen}
        history={props.history}
        isFavorited={props.isFavorited}
        onToggleFavorite={() => {
          if (props.isFavorited) {
            props.onRemoveFavorite(props.currentPalette);
            return;
          }
          props.onAddFavorite();
        }}
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
