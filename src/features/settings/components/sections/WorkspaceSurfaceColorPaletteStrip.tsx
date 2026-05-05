import { type MouseEvent as ReactMouseEvent } from 'react';

import { settingsButtonClassName, settingsPaletteButtonClassName } from '@/shared/ui';

export function WorkspaceSurfaceColorPaletteStrip(props: {
  activeBrushIndex: number;
  colors: string[];
  onAddPaletteColor: () => void;
  onEditColor: (event: ReactMouseEvent<HTMLButtonElement>, index: number) => void;
  onSelectColor: (index: number) => void;
}) {
  return (
    <div className="flex flex-nowrap items-center gap-2">
      {props.colors.map((color, index) => (
        <button
          aria-label={`Palette color ${index + 1}`}
          className={settingsPaletteButtonClassName(index === props.activeBrushIndex, 'size-8 p-0 hover:scale-[1.04]')}
          key={`${color}-${index}`}
          onClick={() => props.onSelectColor(index)}
          onDoubleClick={(event) => props.onEditColor(event, index)}
          style={{ backgroundColor: color }}
          type="button"
        />
      ))}
      <button aria-label="Add palette color" className={settingsButtonClassName('size-8 rounded-sm border-dashed px-0 text-lg text-foreground/70')} onClick={props.onAddPaletteColor} type="button">
        +
      </button>
    </div>
  );
}
