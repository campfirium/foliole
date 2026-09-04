import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsColorSwatchClassName,
  settingsFieldClassName,
  settingsResetButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS } from '../../../editor/model/editorMouseGestureSettings';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';

function Toggle(props: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <button
      aria-checked={props.checked}
      aria-label={props.label}
      className={settingsSwitchClassName(props.checked)}
      onClick={() => props.onChange(!props.checked)}
      role="switch"
      type="button"
    >
      <span className={settingsSwitchKnobClassName(props.checked)} />
    </button>
  );
}

function NumberField(props: {
  ariaLabel: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <input
      aria-label={props.ariaLabel}
      className={settingsFieldClassName(
        `${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} text-right tabular-nums`
      )}
      max={props.max}
      min={props.min}
      onChange={(event) => props.onChange(Number(event.target.value))}
      step={props.step}
      type="number"
      value={props.value}
    />
  );
}

function TrailColorRow() {
  const t = useTranslation();
  const { settings, setTrailColor, setTrailLineWidth } = useMouseGestureSettings();
  return (
    <SettingsRow title={t('settings.search.gestureLineColor.title')}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label={t('settings.mouseGestures.trail.resetColor')}
          className={settingsResetButtonClassName()}
          disabled={settings.trailColor === DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor}
          onClick={() => setTrailColor(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor)}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={18} />
        </button>
        <label className="relative h-9 w-9 shrink-0">
          <span
            aria-hidden="true"
            className={settingsColorSwatchClassName('pointer-events-none absolute inset-0')}
            style={{ backgroundColor: settings.trailColor }}
          />
          <input
            aria-label={t('settings.mouseGestures.trail.colorAria')}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => setTrailColor(event.target.value)}
            type="color"
            value={settings.trailColor}
          />
        </label>
        <input
          aria-label={t('settings.mouseGestures.trail.colorHexAria')}
          className={settingsFieldClassName('w-28 font-mono')}
          maxLength={7}
          onChange={(event) => setTrailColor(event.target.value)}
          value={settings.trailColor}
        />
        <NumberField
          ariaLabel={t('settings.mouseGestures.trail.lineWidthAria')}
          max={12}
          min={1}
          onChange={setTrailLineWidth}
          step={1}
          value={settings.trailLineWidth}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function MouseGestureDisplayRows() {
  const t = useTranslation();
  const controls = useMouseGestureSettings();
  const { settings } = controls;
  return (
    <>
      <SettingsRow title={t('settings.mouseGestures.display.trail')}>
        <SettingsControlSlot>
          <Toggle
            checked={settings.trailVisible}
            label={t('settings.mouseGestures.display.trail')}
            onChange={controls.setTrailVisible}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('settings.mouseGestures.display.hint')}>
        <SettingsControlSlot>
          <Toggle
            checked={settings.hintVisible}
            label={t('settings.mouseGestures.display.hint')}
            onChange={controls.setHintVisible}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <TrailColorRow />
      <MouseGestureDisplayThresholdRows />
    </>
  );
}

function MouseGestureDisplayThresholdRows() {
  const t = useTranslation();
  const controls = useMouseGestureSettings();
  const { settings } = controls;
  return (
    <>
      <SettingsRow
        description={t('settings.mouseGestures.trail.opacity.description')}
        title={t('settings.mouseGestures.trail.opacity.title')}
      >
        <SettingsControlSlot>
          <NumberField
            ariaLabel={t('settings.mouseGestures.trail.opacityAria')}
            max={1}
            min={0.05}
            onChange={controls.setTrailOpacity}
            step={0.05}
            value={settings.trailOpacity}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description={t('settings.search.gestureThreshold.description')}
        title={t('settings.search.gestureThreshold.title')}
      >
        <SettingsControlSlot>
          <NumberField
            ariaLabel={t('settings.mouseGestures.thresholds.directionAria')}
            max={48}
            min={8}
            onChange={controls.setSegmentThreshold}
            step={1}
            value={settings.segmentThresholdPx}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description={t('settings.mouseGestures.thresholds.pointSpacing.description')}
        title={t('settings.mouseGestures.thresholds.pointSpacing.title')}
      >
        <SettingsControlSlot>
          <NumberField
            ariaLabel={t('settings.mouseGestures.thresholds.pointAria')}
            max={24}
            min={2}
            onChange={controls.setTrailPointThreshold}
            step={1}
            value={settings.trailPointThresholdPx}
          />
        </SettingsControlSlot>
      </SettingsRow>
    </>
  );
}
