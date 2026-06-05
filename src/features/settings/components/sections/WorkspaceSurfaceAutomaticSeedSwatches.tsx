import type { RefObject } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  appFloatingSurfaceClassName,
  settingsPaletteButtonClassName
} from '../../../../shared/ui';
import {
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteMode,
  type WorkspaceSurfaceAutoPaletteOptions
} from '../../model/workspaceSurfaceAutoPalette';
import { WORKSPACE_SURFACE_AUTO_SEED_PRESETS } from '../../model/workspaceSurfaceAutoSeedPresets';
import {
  formatWorkspaceSurfaceColorHex,
  parseWorkspaceSurfaceColor,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl
} from '../../model/workspaceSurfaceColor';

import { cn } from '@/shared/lib/utils';

type AutomaticSeedSwatch = {
  displayHex: string;
  hex: string;
  id: string;
  label: string;
  signature: string;
};

function buildAutomaticSeedSwatches(
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode
) {
  const generatedSeeds = [];
  const lightnessSteps = mode === 'dark' ? [24, 34, 44] : [38, 50, 62];
  const saturationSteps = mode === 'dark' ? [10, 18, 26, 34] : [18, 28, 38, 48];
  for (const lightness of lightnessSteps) {
    generatedSeeds.push({
      hex: formatWorkspaceSurfaceColorHex(workspaceSurfaceColorFromHsl({ a: 1, h: 0, l: lightness, s: 0 })),
      id: `neutral-${lightness}`,
      label: `Neutral ${lightness}`
    });
  }
  for (let hue = 0; hue < 360; hue += 15) {
    for (const saturation of saturationSteps) {
      for (const lightness of lightnessSteps) {
        generatedSeeds.push({
          hex: formatWorkspaceSurfaceColorHex(workspaceSurfaceColorFromHsl({ a: 1, h: hue, l: lightness, s: saturation })),
          id: `h${hue}-s${saturation}-l${lightness}`,
          label: `Hue ${hue}`
        });
      }
    }
  }
  return buildUniqueSeedSwatches(generatedSeeds, options, mode);
}

function buildUniqueSeedSwatches(
  generatedSeeds: Array<{ hex: string; id: string; label: string }>,
  options: WorkspaceSurfaceAutoPaletteOptions,
  mode: WorkspaceSurfaceAutoPaletteMode
) {
  const uniqueSwatches = new Map<string, AutomaticSeedSwatch>();
  for (const preset of [...WORKSPACE_SURFACE_AUTO_SEED_PRESETS, ...generatedSeeds]) {
    const parsed = parseWorkspaceSurfaceColor(preset.hex);
    if (!parsed) {
      continue;
    }
    const palette = buildWorkspaceSurfaceAutoColumnPalette(parsed, options, undefined, mode);
    const displayHex = (palette[0] ?? preset.hex).toLowerCase();
    if (!uniqueSwatches.has(displayHex)) {
      uniqueSwatches.set(displayHex, {
        displayHex: palette[0] ?? preset.hex,
        hex: preset.hex,
        id: preset.id,
        label: preset.label,
        signature: palette.join('|')
      });
    }
  }
  return [...uniqueSwatches.values()].sort(compareAutomaticSeedSwatches);
}

function compareAutomaticSeedSwatches(left: AutomaticSeedSwatch, right: AutomaticSeedSwatch) {
  const leftColor = parseWorkspaceSurfaceColor(left.displayHex);
  const rightColor = parseWorkspaceSurfaceColor(right.displayHex);
  if (!leftColor || !rightColor) {
    return left.id.localeCompare(right.id);
  }
  const leftHsl = workspaceSurfaceColorToHsl(leftColor);
  const rightHsl = workspaceSurfaceColorToHsl(rightColor);
  return leftHsl.s === rightHsl.s
    ? leftHsl.h - rightHsl.h || leftHsl.l - rightHsl.l
    : leftHsl.s - rightHsl.s;
}

function AutomaticSeedSwatchGrid(props: {
  activeDisplayHex: string;
  activeSignature: string;
  onSelect: (hex: string) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  const swatches = buildAutomaticSeedSwatches(props.options, props.resolvedBaseColorMode);

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {swatches.map((preset) => (
        <button
          aria-label={`Use automatic seed ${preset.label}`}
          className={settingsPaletteButtonClassName(
            props.activeSignature === preset.signature || props.activeDisplayHex === preset.displayHex.toLowerCase(),
            'size-7 p-0'
          )}
          key={preset.id}
          onClick={() => props.onSelect(preset.hex)}
          style={{ backgroundColor: preset.displayHex }}
          type="button"
        />
      ))}
    </div>
  );
}

export function AutomaticSeedPopoverSurface(props: {
  activeDisplayHex: string;
  activeSignature: string;
  onSelect: (hex: string) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
  panelRef: RefObject<HTMLDivElement | null>;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  const t = useTranslation();
  return (
    <div
      aria-label={t('settings.appearance.surface.autoSeedPicker')}
      className={cn(appFloatingSurfaceClassName('popover'), 'absolute left-0 top-11 z-popover-elevated max-h-80 w-72 overflow-y-auto rounded-md p-2.5 shadow-panel')}
      ref={props.panelRef as RefObject<HTMLDivElement>}
      role="dialog"
      tabIndex={-1}
    >
      <AutomaticSeedSwatchGrid {...props} />
    </div>
  );
}
