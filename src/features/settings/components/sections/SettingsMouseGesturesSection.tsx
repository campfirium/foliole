import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';

import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsColorSwatchClassName,
  settingsFieldClassName,
  settingsResetButtonClassName,
  settingsValueBoxClassName
} from '../../../../shared/ui';
import type { EditorMouseGestureId } from '../../../editor/model/editorMouseGestures';
import {
  DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
  EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS,
  type EditorMouseGestureActionSetting
} from '../../../editor/model/editorMouseGestureSettings';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';

const GESTURE_ROWS: Array<{
  description: string;
  gestureId: EditorMouseGestureId;
  label: string;
}> = [
  { gestureId: 'left', label: 'Left', description: 'Reserved one-stroke gesture. Disabled by default.' },
  { gestureId: 'right', label: 'Right', description: 'Reserved one-stroke gesture. Disabled by default.' },
  { gestureId: 'left-up', label: 'Left then up', description: 'Default shortcut for jumping to the top of the document.' },
  { gestureId: 'left-down', label: 'Left then down', description: 'Default shortcut for jumping to the bottom of the document.' }
];

const ACTION_LABELS: Record<EditorMouseGestureActionSetting, string> = {
  disabled: 'Disabled',
  'scroll-top': 'Scroll to top',
  'scroll-bottom': 'Scroll to bottom'
};

function GestureIcon({ gestureId }: { gestureId: EditorMouseGestureId }) {
  const iconClassName = 'h-4 w-4';
  const containerClassName = settingsValueBoxClassName('inline-flex items-center gap-1 px-2.5 py-1.5');

  if (gestureId === 'left') {
    return <span className={containerClassName}><ArrowLeft className={iconClassName} /></span>;
  }
  if (gestureId === 'right') {
    return <span className={containerClassName}><ArrowRight className={iconClassName} /></span>;
  }
  return (
    <span className={containerClassName}>
      <ArrowLeft className={iconClassName} />
      {gestureId === 'left-up' ? <ArrowUp className={iconClassName} /> : <ArrowDown className={iconClassName} />}
    </span>
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

function MouseGestureAreaSection() {
  return (
    <SettingsSection
      ariaLabel="Mouse gesture area section"
      title="Area"
    >
      <SettingsRow description="More areas can be added later without changing the gesture model." readonly title="Active area">
        <SettingsControlSlot>
          <div className={settingsValueBoxClassName('w-full text-foreground')}>
            Main panel
          </div>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function MouseGestureBindingsSection(props: {
  onActionChange: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => void;
}) {
  const { settings } = useMouseGestureSettings();
  return (
    <SettingsSection
      ariaLabel="Mouse gesture bindings section"
      title="Bindings"
    >
      {GESTURE_ROWS.map((gesture) => (
        <SettingsRow description={gesture.description} key={gesture.gestureId} title={gesture.label}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <GestureIcon gestureId={gesture.gestureId} />
            <select
              aria-label={`${gesture.label} mouse gesture action`}
              className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
              onChange={(event) => props.onActionChange(gesture.gestureId, event.target.value as EditorMouseGestureActionSetting)}
              value={settings.gestureActions[gesture.gestureId]}
            >
              {EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </SettingsControlSlot>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}

function MouseGestureTrailSection(props: {
  onTrailColorChange: (value: string) => void;
  onTrailLineWidthChange: (value: number) => void;
  onTrailOpacityChange: (value: number) => void;
}) {
  const { settings } = useMouseGestureSettings();
  return (
    <SettingsSection
      ariaLabel="Mouse gesture trail section"
      title="Trail"
    >
      <SettingsRow description="Main panel gesture trail color." title="Line color">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-label="Reset mouse gesture trail color"
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={settings.trailColor === DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor}
            onClick={() => props.onTrailColorChange(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <label className="relative h-9 w-9 shrink-0">
            <span
              aria-hidden="true"
              className={settingsColorSwatchClassName('pointer-events-none absolute inset-0')}
              style={{ backgroundColor: settings.trailColor }}
            />
            <input
              aria-label="Mouse gesture trail color"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => props.onTrailColorChange(event.target.value)}
              type="color"
              value={settings.trailColor}
            />
          </label>
          <input
            aria-label="Mouse gesture trail color hex"
            className={settingsFieldClassName(`${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} text-right tabular-nums`)}
            onChange={(event) => props.onTrailColorChange(event.target.value)}
            spellCheck={false}
            value={settings.trailColor.toUpperCase()}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Visible stroke width for the gesture trail." title="Line width (px)">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel="Mouse gesture trail line width" max={12} min={1} onChange={props.onTrailLineWidthChange} step={0.25} value={settings.trailLineWidth} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Opacity of the gesture trail line." title="Opacity">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel="Mouse gesture trail opacity" max={1} min={0.05} onChange={props.onTrailOpacityChange} step={0.05} value={settings.trailOpacity} />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function MouseGestureThresholdsSection(props: {
  onSegmentThresholdChange: (value: number) => void;
  onTrailPointThresholdChange: (value: number) => void;
}) {
  const { settings } = useMouseGestureSettings();
  return (
    <SettingsSection
      ariaLabel="Mouse gesture thresholds section"
      title="Thresholds"
    >
      <SettingsRow description="Minimum movement before a direction is accepted." title="Direction threshold (px)">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel="Mouse gesture direction threshold" max={48} min={8} onChange={props.onSegmentThresholdChange} step={1} value={settings.segmentThresholdPx} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Minimum distance between points in the visible trail." title="Trail point spacing (px)">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <NumberField ariaLabel="Mouse gesture trail point threshold" max={24} min={2} onChange={props.onTrailPointThresholdChange} step={1} value={settings.trailPointThresholdPx} />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsMouseGesturesSection() {
  const {
    setAction,
    setSegmentThreshold,
    setTrailColor,
    setTrailLineWidth,
    setTrailOpacity,
    setTrailPointThreshold
  } = useMouseGestureSettings();

  return (
    <>
      <MouseGestureAreaSection />
      <MouseGestureBindingsSection onActionChange={setAction} />
      <MouseGestureTrailSection
        onTrailColorChange={setTrailColor}
        onTrailLineWidthChange={setTrailLineWidth}
        onTrailOpacityChange={setTrailOpacity}
      />
      <MouseGestureThresholdsSection onSegmentThresholdChange={setSegmentThreshold} onTrailPointThresholdChange={setTrailPointThreshold} />
    </>
  );
}
