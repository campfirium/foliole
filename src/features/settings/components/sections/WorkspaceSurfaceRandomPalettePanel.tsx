import { RefreshCw } from 'lucide-react';

import { settingsColorSwatchClassName, settingsPaletteButtonClassName, settingsUtilityIconButtonClassName } from '../../../../shared/ui';

function RandomPaletteCard(props: {
  ariaLabel: string;
  onClick: () => void;
  palette: string[];
  selected: boolean;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      className={settingsPaletteButtonClassName(props.selected, 'inline-flex w-max items-center gap-0.5 p-1')}
      onClick={props.onClick}
      type="button"
    >
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className={settingsColorSwatchClassName('size-7')}
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </button>
  );
}

export function WorkspaceSurfaceRandomPalettePanel(props: {
  currentPalette: string[];
  onApplyPalette: (palette: string[]) => void;
  onRefresh: () => void;
  randomPalettes: string[][];
}) {
  return (
    <div aria-label="Random mode panel" className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-foreground">Random</h4>
        <button
          aria-label="Refresh random palettes"
          className={settingsUtilityIconButtonClassName(false, 'size-8 rounded-sm px-0')}
          onClick={props.onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="text-current" size={18} strokeWidth={1.9} />
        </button>
      </div>
      <div className="grid w-max grid-cols-3 gap-2.5">
        {props.randomPalettes.map((palette, paletteIndex) => (
          <RandomPaletteCard
            ariaLabel={`Random palette ${paletteIndex + 1}`}
            key={`${paletteIndex}-${palette.join('-')}`}
            onClick={() => props.onApplyPalette(palette)}
            palette={palette}
            selected={palette.join('|') === props.currentPalette.join('|')}
          />
        ))}
      </div>
    </div>
  );
}
