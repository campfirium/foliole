import { settingsColorSwatchClassName, settingsPaletteButtonClassName } from '@/shared/ui';

function AutomaticPalettePreview(props: { palette: string[] }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {props.palette.map((color, index) => (
        <span
          aria-hidden="true"
          className={settingsColorSwatchClassName('size-7')}
          key={`${color}-${index}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function WorkspaceSurfaceAutomaticPaletteCard(props: {
  activeMode: string | null;
  onClick: () => void;
  palette: string[];
}) {
  return (
    <button
      aria-label="Apply automatic palette"
      className={settingsPaletteButtonClassName(props.activeMode === 'automatic')}
      onClick={props.onClick}
      type="button"
    >
      <AutomaticPalettePreview palette={props.palette} />
    </button>
  );
}
