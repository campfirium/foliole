import { type MouseEvent as ReactMouseEvent } from 'react';

import { cn } from '@/shared/lib/utils';

export function WorkspaceSurfaceColorPaletteStrip(props: {
  activeBrushIndex: number;
  colors: string[];
  onAddPaletteColor: () => void;
  onEditColor: (event: ReactMouseEvent<HTMLButtonElement>, index: number) => void;
  onSelectColor: (index: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2.5">
      {props.colors.map((color, index) => (
        <button
          aria-label={`Palette color ${index + 1}`}
          className={cn('h-9 w-9 rounded-sm border transition-transform hover:scale-[1.04]', index === props.activeBrushIndex ? 'border-foreground/85' : 'border-border/55')}
          key={`${color}-${index}`}
          onClick={() => props.onSelectColor(index)}
          onDoubleClick={(event) => props.onEditColor(event, index)}
          style={{ backgroundColor: color }}
          type="button"
        />
      ))}
      <button aria-label="Add palette color" className="flex h-9 w-9 items-center justify-center rounded-sm border border-dashed border-border/55 bg-bg-elevated text-lg text-foreground/70" onClick={props.onAddPaletteColor} type="button">
        +
      </button>
    </div>
  );
}
