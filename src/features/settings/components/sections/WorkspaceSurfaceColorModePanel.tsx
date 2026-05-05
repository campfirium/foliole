import type { ReactNode } from 'react';

import {
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteMode,
  type WorkspaceSurfaceAutoPaletteOptions
} from '../../model/workspaceSurfaceAutoPalette';
import { type WorkspaceSurfaceColorValue } from '../../model/workspaceSurfaceColor';

import { WorkspaceSurfaceAutomaticPaletteCard } from './WorkspaceSurfaceAutomaticPaletteCard';
import { WorkspaceSurfaceAutomaticSeedPopover } from './WorkspaceSurfaceAutomaticSeedPopover';
import { WorkspaceSurfaceRandomPalettePanel } from './WorkspaceSurfaceRandomPalettePanel';
import { WorkspaceSurfaceThemeToolbar } from './WorkspaceSurfaceThemeToolbar';

import { cn } from '@/shared/lib/utils';

function InlineSwitch(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.checked}
      className="inline-flex items-center gap-3 text-left"
      onClick={() => props.onChange(!props.checked)}
      type="button"
    >
      <span className="text-sm text-foreground/82">{props.label}</span>
      <span
        className={cn(
          'relative h-8 w-14 rounded-full border transition-colors',
          props.checked ? 'border-foreground/20 bg-foreground/35' : 'border-border/60 bg-foreground/[0.08]'
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-6 w-6 rounded-full bg-bg-elevated shadow-sm transition-all',
            props.checked ? 'left-7' : 'left-1'
          )}
        />
      </span>
    </button>
  );
}

function WorkspaceSurfacePreferences(props: {
  options: WorkspaceSurfaceAutoPaletteOptions;
  onOptionsChange: (options: WorkspaceSurfaceAutoPaletteOptions) => void;
}) {
  const setOption = (key: keyof WorkspaceSurfaceAutoPaletteOptions, value: boolean) => {
    props.onOptionsChange({ ...props.options, [key]: value });
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">Preferences</h4>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <InlineSwitch checked={props.options.documentPureWhite} label="Use neutral document surface" onChange={(checked) => setOption('documentPureWhite', checked)} />
        <InlineSwitch checked={props.options.folderTopicSharedTone} label="Folder and topic share tone" onChange={(checked) => setOption('folderTopicSharedTone', checked)} />
      </div>
    </div>
  );
}

function ModeBlock(props: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div aria-label={`${props.title} mode panel`} className="space-y-2 px-1 py-1">
      <h4 className="text-sm font-medium text-foreground">{props.title}</h4>
      {props.children}
    </div>
  );
}

function WorkspaceSurfaceAutomaticPanel(props: {
  activeMode: string | null;
  autoSeedColor: WorkspaceSurfaceColorValue;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
  onApplyAutomaticPalette: () => void;
  onAutoSeedColorChange: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const autoPalette = buildWorkspaceSurfaceAutoColumnPalette(props.autoSeedColor, props.options, undefined, props.resolvedBaseColorMode);

  return (
    <ModeBlock title="Automatic">
      <div className="flex items-center gap-2.5">
        <WorkspaceSurfaceAutomaticSeedPopover
          color={props.autoSeedColor}
          onChange={(color) => props.onAutoSeedColorChange(color)}
          options={props.options}
          resolvedBaseColorMode={props.resolvedBaseColorMode}
        />
        <WorkspaceSurfaceAutomaticPaletteCard activeMode={props.activeMode} onClick={props.onApplyAutomaticPalette} palette={autoPalette} />
      </div>
    </ModeBlock>
  );
}

export function WorkspaceSurfaceColorModePanel(props: {
  activeMode: string | null;
  autoOptions: WorkspaceSurfaceAutoPaletteOptions;
  autoSeedColor: WorkspaceSurfaceColorValue;
  currentPalette: string[];
  favorites: string[][];
  history: string[][];
  isFavorited: boolean;
  onAddFavorite: () => void;
  onApplyAutomaticPalette: () => void;
  onApplyFavorite: (palette: string[]) => void;
  onApplyHistory: (palette: string[]) => void;
  onApplyRandomPalette: (palette: string[]) => void;
  onAutoOptionsChange: (options: WorkspaceSurfaceAutoPaletteOptions) => void;
  onAutoSeedColorChange: (color: WorkspaceSurfaceColorValue) => void;
  onRemoveFavorite: (palette: string[]) => void;
  onRefreshRandomPalettes: () => void;
  randomPalettes: string[][];
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  return (
    <div className="mt-3 space-y-4">
      <WorkspaceSurfacePreferences onOptionsChange={props.onAutoOptionsChange} options={props.autoOptions} />
      <WorkspaceSurfaceThemeToolbar
        currentPalette={props.currentPalette}
        favorites={props.favorites}
        history={props.history}
        isFavorited={props.isFavorited}
        onAddFavorite={props.onAddFavorite}
        onApplyFavorite={props.onApplyFavorite}
        onApplyHistory={props.onApplyHistory}
        onRemoveFavorite={props.onRemoveFavorite}
      />
      <WorkspaceSurfaceRandomPalettePanel
        currentPalette={props.currentPalette}
        onApplyPalette={props.onApplyRandomPalette}
        onRefresh={props.onRefreshRandomPalettes}
        randomPalettes={props.randomPalettes}
      />
      <WorkspaceSurfaceAutomaticPanel
        activeMode={props.activeMode}
        autoSeedColor={props.autoSeedColor}
        onApplyAutomaticPalette={props.onApplyAutomaticPalette}
        onAutoSeedColorChange={props.onAutoSeedColorChange}
        options={props.autoOptions}
        resolvedBaseColorMode={props.resolvedBaseColorMode}
      />
    </div>
  );
}
