import { useEffect, useMemo, useRef, useState } from 'react';

import { onWindowEscape } from '../../../../shared/platform/keyboard';
import {
  settingsColorSwatchClassName,
  settingsFieldClassName
} from '../../../../shared/ui';
import {
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteMode,
  type WorkspaceSurfaceAutoPaletteOptions
} from '../../model/workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorHex,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from '../../model/workspaceSurfaceColor';

import { AutomaticSeedPopoverSurface } from './WorkspaceSurfaceAutomaticSeedSwatches';

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
    window.addEventListener('pointerdown', handlePointerDown);
    const unlistenEscape = onWindowEscape(() => setOpen(false));
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      unlistenEscape();
    };
  }, [open]);

  return { draft, open, setDraft, setOpen };
}

function useAutomaticSeedDialogFocus(open: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    panelRef.current?.focus();
    return () => triggerRef.current?.focus();
  }, [open]);

  return { panelRef, triggerRef };
}

function useAutomaticSeedActiveState(props: {
  color: WorkspaceSurfaceColorValue;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  const palette = useMemo(
    () => buildWorkspaceSurfaceAutoColumnPalette(props.color, props.options, undefined, props.resolvedBaseColorMode),
    [props.color, props.options, props.resolvedBaseColorMode]
  );

  return {
    activeDisplayHex: (palette[0] ?? formatWorkspaceSurfaceColorHex(props.color)).toLowerCase(),
    activeSignature: palette.join('|')
  };
}

export function WorkspaceSurfaceAutomaticSeedPopover(props: {
  color: WorkspaceSurfaceColorValue;
  onChange: (color: WorkspaceSurfaceColorValue) => void;
  options: WorkspaceSurfaceAutoPaletteOptions;
  resolvedBaseColorMode: WorkspaceSurfaceAutoPaletteMode;
}) {
  const { draft, open, setDraft, setOpen } = useAutomaticSeedPopoverState(props.color);
  const { panelRef, triggerRef } = useAutomaticSeedDialogFocus(open);
  const { activeDisplayHex, activeSignature } = useAutomaticSeedActiveState(props);

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
          ref={triggerRef}
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
          panelRef={panelRef}
          resolvedBaseColorMode={props.resolvedBaseColorMode}
        />
      ) : null}
    </div>
  );
}
