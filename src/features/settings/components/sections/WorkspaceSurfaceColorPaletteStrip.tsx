import { type MouseEvent as ReactMouseEvent } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';

import { settingsButtonClassName, settingsPaletteButtonClassName } from '@/shared/ui';

export function WorkspaceSurfaceColorPaletteStrip(props: {
  activeBrushIndex: number;
  colors: string[];
  onAddPaletteColor: () => void;
  onEditColor: (event: ReactMouseEvent<HTMLButtonElement>, index: number) => void;
  onSelectColor: (index: number) => void;
}) {
  const t = useTranslation();

  return (
    <div className="flex flex-nowrap items-center gap-2">
      {props.colors.map((color, index) => (
        <button
          aria-label={t('settings.appearance.surface.palette.color', { index: index + 1 })}
          className={settingsPaletteButtonClassName(index === props.activeBrushIndex, 'size-8 p-0 hover:scale-[1.04]')}
          key={`${color}-${index}`}
          onClick={() => props.onSelectColor(index)}
          onDoubleClick={(event) => props.onEditColor(event, index)}
          style={{ backgroundColor: color }}
          type="button"
        />
      ))}
      <button aria-label={t('settings.appearance.surface.palette.add')} className={settingsButtonClassName('size-8 rounded-sm border-dashed px-0 text-lg text-foreground/70')} onClick={props.onAddPaletteColor} type="button">
        +
      </button>
    </div>
  );
}
