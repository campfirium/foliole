import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsColorSwatchClassName,
  settingsFieldClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import { DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS } from '../../../editor/model/editorMouseGestureSettings';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

function NumberField(props: {
  ariaLabel: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <div className="inline-flex items-center">
      <input
        aria-label={props.ariaLabel}
        className={settingsFieldClassName(`${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} text-right tabular-nums`)}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step}
        type="number"
        value={props.value}
      />
    </div>
  );
}

export function MouseGestureTrailSection(props: {
  onTrailColorChange: (value: string) => void;
  onTrailLineWidthChange: (value: number) => void;
  onTrailOpacityChange: (value: number) => void;
}) {
  const { settings } = useMouseGestureSettings();
  const t = useTranslation();
  const lineColorRow = useLocalizedSettingsSearchRow('mouse-gestures-line-color');
  const lineWidthRow = useLocalizedSettingsSearchRow('mouse-gestures-line-width');

  return (
    <SettingsSection ariaLabel={t('settings.mouseGestures.trail.sectionAria')} title={t('settings.mouseGestures.trail.title')}>
      <SettingsRow {...settingsSearchRowProps(lineColorRow)} description={lineColorRow.description} title={lineColorRow.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-label={t('settings.mouseGestures.trail.resetColor')}
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={settings.trailColor === DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor}
            onClick={() => props.onTrailColorChange(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <label className="relative h-9 w-9 shrink-0">
            <span aria-hidden="true" className={settingsColorSwatchClassName('pointer-events-none absolute inset-0')} style={{ backgroundColor: settings.trailColor }} />
            <input aria-label={t('settings.mouseGestures.trail.colorAria')} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => props.onTrailColorChange(event.target.value)} type="color" value={settings.trailColor} />
          </label>
          <input aria-label={t('settings.mouseGestures.trail.colorHexAria')} className={settingsFieldClassName(`${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} text-right tabular-nums`)} onChange={(event) => props.onTrailColorChange(event.target.value)} spellCheck={false} value={settings.trailColor.toUpperCase()} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow {...settingsSearchRowProps(lineWidthRow)} description={lineWidthRow.description} title={lineWidthRow.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel={t('settings.mouseGestures.trail.lineWidthAria')} max={12} min={1} onChange={props.onTrailLineWidthChange} step={0.25} value={settings.trailLineWidth} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description={t('settings.mouseGestures.trail.opacity.description')} title={t('settings.mouseGestures.trail.opacity.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel={t('settings.mouseGestures.trail.opacityAria')} max={1} min={0.05} onChange={props.onTrailOpacityChange} step={0.05} value={settings.trailOpacity} />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function MouseGestureThresholdsSection(props: {
  onSegmentThresholdChange: (value: number) => void;
  onTrailPointThresholdChange: (value: number) => void;
}) {
  const { settings } = useMouseGestureSettings();
  const t = useTranslation();
  const directionThresholdRow = useLocalizedSettingsSearchRow('mouse-gestures-direction-threshold');

  return (
    <SettingsSection ariaLabel={t('settings.mouseGestures.thresholds.sectionAria')} title={t('settings.mouseGestures.thresholds.title')}>
      <SettingsRow {...settingsSearchRowProps(directionThresholdRow)} description={directionThresholdRow.description} title={directionThresholdRow.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel={t('settings.mouseGestures.thresholds.directionAria')} max={48} min={8} onChange={props.onSegmentThresholdChange} step={1} value={settings.segmentThresholdPx} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description={t('settings.mouseGestures.thresholds.pointSpacing.description')} title={t('settings.mouseGestures.thresholds.pointSpacing.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel={t('settings.mouseGestures.thresholds.pointAria')} max={24} min={2} onChange={props.onTrailPointThresholdChange} step={1} value={settings.trailPointThresholdPx} />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
