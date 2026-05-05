import { useEffect, useMemo, useState } from 'react';

import {
  appFloatingSurfaceClassName,
  settingsColorSwatchClassName,
  settingsFieldClassName,
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
  type WorkspaceSurfaceColorValue,
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
  const uniqueSwatches = new Map<string, AutomaticSeedSwatch>();
  for (const preset of [...WORKSPACE_SURFACE_AUTO_SEED_PRESETS, ...generatedSeeds]) {
    const parsed = parseWorkspaceSurfaceColor(preset.hex);
    if (!parsed) {
      continue;
    }
    const palette = buildWorkspaceSurfaceAutoColumnPalette(parsed, options, undefined, mode);
    const signature = palette.join('|');
    const displayHex = (palette[0] ?? preset.hex).toLowerCase();
    if (!uniqueSwatches.has(displayHex)) {
      uniqueSwatches.set(displayHex, {
        displayHex: palette[0] ?? preset.hex,
        hex: preset.hex,
        id: preset.id,
        label: preset.label,
        signature
      });
    }
  }
  return [...uniqueSwatches.values()].sort((left, right) => {
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
  });
}

function useAutomaticSeedPopoverState(color: WorkspaceSurfaceColorValue) {
  const [draft, setDraft] = useState(() => formatWorkspaceSurfaceColorHex(color));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraft(formatWorkspaceSurfaceColorHex(color));
  }, [color]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-auto-seed-popover]')) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return { draft, open, setDraft, setOpen };
}

function AutomaticSeedSwatchGrid(props: {
  activeDisplayHex: string;
  activeSignature: string;
  onSelect: (hex: string) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  const swatches = useMemo(
    () => buildAutomaticSeedSwatches(props.options, props.resolvedBaseColorMode),
    [props.options, props.resolvedBaseColorMode]
  );

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

function AutomaticSeedPopoverSurface(props: {
  activeDisplayHex: string;
  activeSignature: string;
  onSelect: (hex: string) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  return (
    <div
      className={cn(appFloatingSurfaceClassName('popover'), 'absolute left-0 top-11 z-[95] max-h-80 w-72 overflow-y-auto rounded-md p-2.5 shadow-panel')}
    >
      <AutomaticSeedSwatchGrid {...props} />
    </div>
  );
}

export function WorkspaceSurfaceAutomaticSeedPopover(props: {
  color: WorkspaceSurfaceColorValue;
  onChange: (color: WorkspaceSurfaceColorValue) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  const { draft, open, setDraft, setOpen } = useAutomaticSeedPopoverState(props.color);
  const activeSignature = useMemo(() => {
    const palette = buildWorkspaceSurfaceAutoColumnPalette(props.color, props.options, undefined, props.resolvedBaseColorMode);
    return palette.join('|');
  }, [props.color, props.options, props.resolvedBaseColorMode]);
  const activeDisplayHex = useMemo(() => {
    const palette = buildWorkspaceSurfaceAutoColumnPalette(props.color, props.options, undefined, props.resolvedBaseColorMode);
    return (palette[0] ?? formatWorkspaceSurfaceColorHex(props.color)).toLowerCase();
  }, [props.color, props.options, props.resolvedBaseColorMode]);

  const applyHex = (value: string) => {
    setDraft(value);
    const parsed = parseWorkspaceSurfaceColor(value.trim());
    if (parsed) {
      props.onChange({ ...parsed, a: props.color.a });
    }
  };

  return (
    <div className="relative" data-auto-seed-popover>
      <div className="flex items-center gap-2">
        <button
          aria-label="Automatic workspace seed color"
          className={settingsColorSwatchClassName('size-8 shrink-0')}
          onClick={() => setOpen((value) => !value)}
          style={{ backgroundColor: activeDisplayHex }}
          type="button"
        />
        <label className="shrink-0 text-sm text-foreground/72">
          <input
            aria-label="Automatic workspace seed hex"
            className={settingsFieldClassName('w-24')}
            onChange={(event) => applyHex(event.target.value)}
            spellCheck={false}
            value={draft}
          />
        </label>
      </div>
      {open ? (
        <AutomaticSeedPopoverSurface
          activeDisplayHex={activeDisplayHex}
          activeSignature={activeSignature}
          onSelect={(hex) => {
            applyHex(hex);
            setOpen(false);
          }}
          options={props.options}
          resolvedBaseColorMode={props.resolvedBaseColorMode}
        />
      ) : null}
    </div>
  );
}
