import { RefreshCw } from 'lucide-react';

import { AppIconButton } from '../../../../shared/ui';

import { cn } from '@/shared/lib/utils';

function isSamePalette(left: string[], right: string[]) {
  return left.length === right.length && left.every((color, index) => color === right[index]);
}

function RandomPaletteCard(props: {
  ariaLabel: string;
  onClick: () => void;
  palette: string[];
  selected: boolean;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      className={cn(
        'flex items-center gap-1 rounded-sm border p-1 transition-colors',
        props.selected ? 'border-border-strong/75 bg-foreground/[0.04]' : 'border-transparent hover:border-border/45 hover:bg-foreground/[0.02]'
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className="block h-9 w-9 rounded-sm border border-border/40"
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </button>
  );
}

export function WorkspaceSurfaceRandomPalettePanel(props: {
  activeMode: string | null;
  currentPalette: string[];
  onApplyPalette: (palette: string[]) => void;
  onRefresh: () => void;
  randomPalettes: string[][];
}) {
  const palettes = [props.currentPalette, ...props.randomPalettes];
  const rows = [palettes.slice(0, 4), palettes.slice(4, 8)];
  const isRandomMode = props.activeMode === 'random';

  return (
    <div aria-label="Random mode panel" className="space-y-2 px-1 py-1">
      <div className="flex items-center gap-1.5">
        <h4 className="text-sm font-medium text-foreground">Random</h4>
        <AppIconButton
          className="size-7 rounded-sm border border-border/55 text-foreground/60 hover:border-border/75 hover:bg-foreground/[0.03]"
          icon={<RefreshCw aria-hidden="true" size={14} strokeWidth={2} />}
          label="Refresh random palettes"
          onClick={props.onRefresh}
        />
      </div>
      <div className="space-y-1.5">
        {rows.map((row, rowIndex) => (
          <div className="flex flex-wrap gap-1.5" key={rowIndex}>
            {row.map((palette, paletteIndex) => (
              <RandomPaletteCard
                ariaLabel={
                  rowIndex === 0 && paletteIndex === 0
                    ? 'Current random palette'
                    : `Random palette ${rowIndex * 4 + paletteIndex + 1}`
                }
                key={`${rowIndex}-${paletteIndex}-${palette.join('-')}`}
                onClick={() => props.onApplyPalette(palette)}
                palette={palette}
                selected={isRandomMode && isSamePalette(palette, props.currentPalette)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
