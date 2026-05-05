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

import { settingsSwitchClassName, settingsSwitchKnobClassName } from '@/shared/ui';

function InlineSwitch(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-label={props.label}
      aria-checked={props.checked}
      className="inline-flex w-full items-center justify-between gap-4 text-left"
      role="switch"
      onClick={() => props.onChange(!props.checked)}
      type="button"
    >
      <span className="min-w-0 flex-1 text-sm text-foreground/82">{props.label}</span>
      <span className={settingsSwitchClassName(props.checked)} aria-hidden="true">
        <span className={settingsSwitchKnobClassName(props.checked)} />
      </span>
    </button>
  );
}

export function WorkspaceSurfacePreferences(props: {
  options: WorkspaceSurfaceAutoPaletteOptions;
  onOptionsChange: (options: WorkspaceSurfaceAutoPaletteOptions) => void;
}) {
  const setOption = (key: keyof WorkspaceSurfaceAutoPaletteOptions, value: boolean) => {
    props.onOptionsChange({ ...props.options, [key]: value });
  };

  return (
    <ModeBlock title="Preferences">
      <div className="space-y-2">
        <InlineSwitch checked={props.options.documentPureWhite} label="Use neutral document surface" onChange={(checked) => setOption('documentPureWhite', checked)} />
        <InlineSwitch checked={props.options.folderTopicSharedTone} label="Folder and topic share tone" onChange={(checked) => setOption('folderTopicSharedTone', checked)} />
      </div>
    </ModeBlock>
  );
}

function ModeBlock(props: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div aria-label={`${props.title} mode panel`} className="space-y-2 py-1">
      <h4 className="text-sm font-medium text-foreground">{props.title}</h4>
      {props.children}
    </div>
  );
}

export function WorkspaceSurfaceAutomaticPanel(props: {
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
      <div className="flex items-center gap-2">
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <WorkspaceSurfaceRandomPalettePanel
        currentPalette={props.currentPalette}
        onApplyPalette={props.onApplyRandomPalette}
        onRefresh={props.onRefreshRandomPalettes}
        randomPalettes={props.randomPalettes}
      />
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
    </div>
  );
}
