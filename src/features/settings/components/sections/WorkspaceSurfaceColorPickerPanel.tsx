import { Pipette } from 'lucide-react';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { settingsButtonClassName, settingsColorSwatchClassName, settingsPickerTrackClassName } from '../../../../shared/ui';
import { formatWorkspaceSurfaceColorCss, formatWorkspaceSurfaceColorHex, parseWorkspaceSurfaceColor, type WorkspaceSurfaceColorValue, workspaceSurfaceColorFromHsv, workspaceSurfaceColorToHsv } from '../../model/workspaceSurfaceColor';

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function resolveRectPoint(rect: DOMRect, clientX: number, clientY: number) {
  return {
    x: clampPercent(((clientX - rect.left) / rect.width) * 100),
    y: clampPercent(((clientY - rect.top) / rect.height) * 100)
  };
}

function trackSquare(event: ReactPointerEvent<HTMLDivElement>, onMove: (next: { s: number; v: number }) => void) {
  const rect = event.currentTarget.getBoundingClientRect();
  const applyPoint = (clientX: number, clientY: number) => {
    const point = resolveRectPoint(rect, clientX, clientY);
    onMove({ s: point.x, v: 100 - point.y });
  };
  applyPoint(event.clientX, event.clientY);
  const handlePointerMove = (nextEvent: PointerEvent) => applyPoint(nextEvent.clientX, nextEvent.clientY);
  const handlePointerUp = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp, { once: true });
}

function trackSlider(event: ReactPointerEvent<HTMLDivElement>, onMove: (nextPercent: number) => void) {
  const rect = event.currentTarget.getBoundingClientRect();
  const applyPoint = (clientX: number) => onMove(resolveRectPoint(rect, clientX, rect.top).x);
  applyPoint(event.clientX);
  const handlePointerMove = (nextEvent: PointerEvent) => applyPoint(nextEvent.clientX);
  const handlePointerUp = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp, { once: true });
}

function WorkspaceSurfaceColorArea(props: {
  color: WorkspaceSurfaceColorValue;
  onColorChange: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  const hsv = workspaceSurfaceColorToHsv(props.color);
  const hueColor = workspaceSurfaceColorFromHsv({ a: 1, h: hsv.h, s: 100, v: 100 });
  return (
    <div
      aria-label={t('settings.appearance.surface.colorPicker.area')}
      className="relative h-48"
      onPointerDown={(event) => {
        trackSquare(event, (next) => {
          props.onColorChange(workspaceSurfaceColorFromHsv({ a: props.color.a, h: hsv.h, s: next.s, v: next.v }));
        });
      }}
      role="presentation"
      style={{ backgroundColor: formatWorkspaceSurfaceColorCss(hueColor) }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#ffffff_0%,transparent_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,#000000_100%)]" />
      <div className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-white shadow-picker-thumb-ring-strong" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} />
    </div>
  );
}

function WorkspaceSurfaceColorSliderSection(props: {
  color: WorkspaceSurfaceColorValue;
  nativeInputRef: React.RefObject<HTMLInputElement>;
  onAlphaChange: (alphaPercent: number) => void;
  onColorChange: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  const hsv = workspaceSurfaceColorToHsv(props.color);
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        <button aria-label={t('settings.appearance.surface.colorPicker.nativeOpen')} className={settingsButtonClassName('size-10 px-0 text-foreground/78')} onClick={() => props.nativeInputRef.current?.click()} type="button">
          <Pipette className="h-5 w-5" strokeWidth={2.1} />
        </button>
        <div className={settingsColorSwatchClassName('size-12 rounded-full')} style={{ backgroundColor: formatWorkspaceSurfaceColorCss(props.color) }} />
        <div
          aria-label={t('settings.appearance.surface.colorPicker.hueSlider')}
          className={settingsPickerTrackClassName('h-6 flex-1')}
          onPointerDown={(event) => {
            trackSlider(event, (percent) => {
              props.onColorChange(workspaceSurfaceColorFromHsv({ a: props.color.a, h: Math.round((percent / 100) * 360), s: hsv.s, v: hsv.v }));
            });
          }}
          role="presentation"
          style={{ backgroundImage: 'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }}
        >
          <div className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-white shadow-picker-thumb-ring" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>
      <div
        aria-label={t('settings.appearance.surface.colorPicker.alphaSlider')}
        className={settingsPickerTrackClassName('h-5 bg-[linear-gradient(45deg,rgb(var(--color-foreground)_/_0.08)_25%,transparent_25%,transparent_50%,rgb(var(--color-foreground)_/_0.08)_50%,rgb(var(--color-foreground)_/_0.08)_75%,transparent_75%,transparent_100%)] bg-[length:16px_16px]')}
        onPointerDown={(event) => trackSlider(event, (percent) => props.onAlphaChange(Math.round(percent)))}
        role="presentation"
      >
        <div className="absolute inset-0 rounded-md" style={{ backgroundImage: `linear-gradient(90deg, transparent 0%, ${formatWorkspaceSurfaceColorCss({ ...props.color, a: 1 })} 100%)` }} />
        <div className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-white shadow-picker-thumb-ring" style={{ left: `${props.color.a * 100}%` }} />
      </div>
    </div>
  );
}

export function WorkspaceSurfaceColorPickerPanel(props: {
  color: WorkspaceSurfaceColorValue;
  onAlphaChange: (alphaPercent: number) => void;
  onColorChange: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="overflow-hidden rounded-lg bg-settings-control">
      <WorkspaceSurfaceColorArea color={props.color} onColorChange={props.onColorChange} />
      <WorkspaceSurfaceColorSliderSection color={props.color} nativeInputRef={nativeInputRef} onAlphaChange={props.onAlphaChange} onColorChange={props.onColorChange} />
      <input
        aria-label={t('settings.appearance.surface.colorPicker.native')}
        className="sr-only"
        onChange={(event) => {
          const parsed = parseWorkspaceSurfaceColor(event.target.value);
          if (!parsed) {
            return;
          }
          props.onColorChange({ ...parsed, a: props.color.a });
        }}
        ref={nativeInputRef}
        type="color"
        value={formatWorkspaceSurfaceColorHex(props.color)}
      />
    </div>
  );
}
