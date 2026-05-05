import { useEffect, useMemo, useState } from 'react';

import { AppInput, appFloatingSurfaceClassName } from '../../../../shared/ui';
import {
  buildWorkspaceSurfaceAutoColumnPalette,
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

function buildAutomaticSeedSwatches(
  options: WorkspaceSurfaceAutoPaletteOptions
) {
  const generatedSeeds = [];
  for (const lightness of [38, 50, 62]) {
    generatedSeeds.push({
      hex: formatWorkspaceSurfaceColorHex(workspaceSurfaceColorFromHsl({ a: 1, h: 0, l: lightness, s: 0 })),
      id: `neutral-${lightness}`,
      label: `Neutral ${lightness}`
    });
  }
  for (let hue = 0; hue < 360; hue += 15) {
    for (const saturation of [18, 28, 38, 48]) {
      for (const lightness of [38, 50, 62]) {
        generatedSeeds.push({
          hex: formatWorkspaceSurfaceColorHex(workspaceSurfaceColorFromHsl({ a: 1, h: hue, l: lightness, s: saturation })),
          id: `h${hue}-s${saturation}-l${lightness}`,
          label: `Hue ${hue}`
        });
      }
    }
  }
  const uniqueSwatches = new Map<string, { displayHex: string; hex: string; id: string; label: string }>();
  for (const preset of [...WORKSPACE_SURFACE_AUTO_SEED_PRESETS, ...generatedSeeds]) {
    const parsed = parseWorkspaceSurfaceColor(preset.hex);
    if (!parsed) {
      continue;
    }
    const palette = buildWorkspaceSurfaceAutoColumnPalette(parsed, options);
    const signature = palette.join('|');
    if (!uniqueSwatches.has(signature)) {
      uniqueSwatches.set(signature, {
        displayHex: palette[0] ?? preset.hex,
        hex: preset.hex,
        id: preset.id,
        label: preset.label
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
  onSelect: (hex: string) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
}) {
  const swatches = useMemo(() => buildAutomaticSeedSwatches(props.options), [props.options]);

  return (
    <div className="grid grid-cols-8 gap-1.5">
      {swatches.map((preset) => (
        <button
          aria-label={`Use automatic seed ${preset.label}`}
          className={cn(
            'h-9 w-9 rounded-sm border transition-colors',
            props.activeDisplayHex === preset.displayHex.toLowerCase()
              ? 'border-border-strong/75 ring-1 ring-border-strong/45'
              : 'border-border/40 hover:border-border/70'
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

export function WorkspaceSurfaceAutomaticSeedPopover(props: {
  color: WorkspaceSurfaceColorValue;
  onChange: (color: WorkspaceSurfaceColorValue) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
}) {
  const { draft, open, setDraft, setOpen } = useAutomaticSeedPopoverState(props.color);
  const activeDisplayHex = useMemo(() => {
    const palette = buildWorkspaceSurfaceAutoColumnPalette(props.color, props.options);
    return (palette[0] ?? formatWorkspaceSurfaceColorHex(props.color)).toLowerCase();
  }, [props.color, props.options]);

  const applyHex = (value: string) => {
    setDraft(value);
    const parsed = parseWorkspaceSurfaceColor(value.trim());
    if (parsed) {
      props.onChange({ ...parsed, a: props.color.a });
    }
  };

  return (
    <div className="relative" data-auto-seed-popover>
      <div className="flex items-center gap-2.5">
        <button
          aria-label="Automatic workspace seed color"
          className="h-9 w-9 shrink-0 rounded-sm border border-border/55"
          onClick={() => setOpen((value) => !value)}
          style={{ backgroundColor: activeDisplayHex }}
          type="button"
        />
        <label className="w-28 shrink-0 text-sm text-foreground/72">
          <AppInput
            aria-label="Automatic workspace seed hex"
            className="h-9 rounded-md px-3 text-sm"
            onChange={(event) => applyHex(event.target.value)}
            spellCheck={false}
            value={draft}
          />
        </label>
      </div>
      {open ? (
        <div
          className={cn(appFloatingSurfaceClassName('popover'), 'absolute left-0 top-11 z-[95] w-[416px] rounded-md border-border/70 p-3 shadow-panel')}
        >
          <AutomaticSeedSwatchGrid
            activeDisplayHex={activeDisplayHex}
            onSelect={(hex) => {
              applyHex(hex);
              setOpen(false);
            }}
            options={props.options}
          />
        </div>
      ) : null}
    </div>
  );
}
