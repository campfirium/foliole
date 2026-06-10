import { Library, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';

import { WorkspaceSurfaceThemeFavoritesPopover, type ThemeFavoritesPopoverPosition } from './WorkspaceSurfaceThemeFavoritesPopover';

import { settingsColorSwatchClassName, settingsCompactUtilityIconButtonClassName, settingsPaletteButtonClassName, settingsValueBoxClassName } from '@/shared/ui';

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
  title?: string;
  onClick: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      aria-pressed={props.active}
      className={settingsCompactUtilityIconButtonClassName(props.active)}
      onClick={props.onClick}
      ref={props.triggerRef}
      title={props.title}
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
  const t = useTranslation();
  return (
    <div aria-label={t('settings.appearance.surface.themeHistory')} className="flex items-center gap-1.5">
      {Array.from({ length: 8 }, (_, index) => {
        const palette = props.history[index];
        const label = t('settings.appearance.surface.restoreHistory', { index: index + 1 });
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
  const t = useTranslation();

  return (
    <div className="space-y-3" ref={props.toolbarRef}>
      <div className="space-y-2 py-1">
        <h4 className="text-sm font-medium text-foreground">{t('settings.appearance.surface.currentTheme')}</h4>
        <div className="flex items-center gap-2">
          <PaletteStrip palette={props.currentPalette} />
          <IconToggleButton
            active={props.isFavorited}
            ariaLabel={props.isFavorited ? t('settings.appearance.surface.removeFavorite') : t('settings.appearance.surface.addFavorite')}
            onClick={props.onToggleFavorite}
            title={props.isFavorited ? t('settings.appearance.surface.favorited') : t('settings.appearance.surface.addFavorite')}
          >
            <Star aria-hidden="true" className="text-current" fill={props.isFavorited ? 'currentColor' : 'none'} fillOpacity={props.isFavorited ? 0.16 : undefined} size={22} strokeWidth={1.9} />
          </IconToggleButton>
          <IconToggleButton
            active={props.favoritesOpen}
            ariaLabel={t('settings.appearance.surface.openCollection')}
            onClick={props.onToggleFavorites}
            triggerRef={props.triggerRef}
            title={t('settings.appearance.surface.collection')}
          >
            <Library aria-hidden="true" className="text-current" size={22} strokeWidth={1.8} />
          </IconToggleButton>
        </div>
      </div>
      <div className="space-y-2 border-t border-settings-divider/55 py-3">
        <h4 className="text-sm font-medium text-foreground">{t('settings.appearance.surface.history')}</h4>
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
