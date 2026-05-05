import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import type { EditorMouseGestureId } from '../../../editor/model/editorMouseGestures';
import {
  EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS,
  type EditorMouseGestureActionSetting,
  type EditorMouseGestureSettings
} from '../../../editor/model/editorMouseGestureSettings';

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
  const containerClassName = 'inline-flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-foreground/75';

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
  suffix?: string;
  value: number;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <input
        aria-label={props.ariaLabel}
        className="w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground"
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step}
        type="number"
        value={props.value}
      />
      {props.suffix ? <span className="text-sm text-foreground/60">{props.suffix}</span> : null}
    </div>
  );
}

function MouseGestureAreaSection() {
  return (
    <SettingsSection
      ariaLabel="Mouse gesture area section"
      description="Mouse gestures are currently available only inside the main document panel."
      title="Area"
    >
      <SettingsRow description="More areas can be added later without changing the gesture model." readonly title="Active area">
        <SettingsControlSlot>
          <div className="w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground">
            Main panel
          </div>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function MouseGestureBindingsSection(props: {
  gestureActions: EditorMouseGestureSettings['gestureActions'];
  onActionChange: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => void;
}) {
  return (
    <SettingsSection
      ariaLabel="Mouse gesture bindings section"
      description="Pick an action for each gesture. One-stroke and two-stroke gestures share the same list."
      title="Bindings"
    >
      {GESTURE_ROWS.map((gesture) => (
        <SettingsRow description={gesture.description} key={gesture.gestureId} title={gesture.label}>
          <SettingsControlSlot className="flex-[0_0_420px] gap-3 max-[1080px]:flex-auto">
            <GestureIcon gestureId={gesture.gestureId} />
            <select
              aria-label={`${gesture.label} mouse gesture action`}
              className="w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground"
              onChange={(event) => props.onActionChange(gesture.gestureId, event.target.value as EditorMouseGestureActionSetting)}
              value={props.gestureActions[gesture.gestureId]}
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
  mouseGestureSettings: EditorMouseGestureSettings;
  onTrailColorChange: (value: string) => void;
  onTrailLineWidthChange: (value: number) => void;
  onTrailOpacityChange: (value: number) => void;
}) {
  return (
    <SettingsSection
      ariaLabel="Mouse gesture trail section"
      description="These values control the line you see while drawing a gesture."
      title="Trail"
    >
      <SettingsRow description="Main panel gesture trail color." title="Line color">
        <SettingsControlSlot>
          <input
            aria-label="Mouse gesture trail color"
            className="h-10 w-14 rounded-md border border-border bg-bg-elevated p-1"
            onChange={(event) => props.onTrailColorChange(event.target.value)}
            type="color"
            value={props.mouseGestureSettings.trailColor}
          />
          <input
            aria-label="Mouse gesture trail color hex"
            className="w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground"
            onChange={(event) => props.onTrailColorChange(event.target.value)}
            value={props.mouseGestureSettings.trailColor}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Visible stroke width for the gesture trail." title="Line width">
        <SettingsControlSlot>
          <NumberField ariaLabel="Mouse gesture trail line width" max={12} min={1} onChange={props.onTrailLineWidthChange} step={0.25} suffix="px" value={props.mouseGestureSettings.trailLineWidth} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Opacity of the gesture trail line." title="Opacity">
        <SettingsControlSlot>
          <NumberField ariaLabel="Mouse gesture trail opacity" max={1} min={0.05} onChange={props.onTrailOpacityChange} step={0.05} value={props.mouseGestureSettings.trailOpacity} />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function MouseGestureThresholdsSection(props: {
  mouseGestureSettings: EditorMouseGestureSettings;
  onSegmentThresholdChange: (value: number) => void;
  onTrailPointThresholdChange: (value: number) => void;
}) {
  return (
    <SettingsSection
      ariaLabel="Mouse gesture thresholds section"
      description="Tweak how much movement is needed before a stroke is counted."
      title="Thresholds"
    >
      <SettingsRow description="Minimum movement before a direction is accepted." title="Direction threshold">
        <SettingsControlSlot>
          <NumberField ariaLabel="Mouse gesture direction threshold" max={48} min={8} onChange={props.onSegmentThresholdChange} step={1} suffix="px" value={props.mouseGestureSettings.segmentThresholdPx} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description="Minimum distance between points in the visible trail." title="Trail point spacing">
        <SettingsControlSlot>
          <NumberField ariaLabel="Mouse gesture trail point threshold" max={24} min={2} onChange={props.onTrailPointThresholdChange} step={1} suffix="px" value={props.mouseGestureSettings.trailPointThresholdPx} />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsMouseGesturesSection({
  mouseGestureSettings,
  onActionChange,
  onSegmentThresholdChange,
  onTrailColorChange,
  onTrailLineWidthChange,
  onTrailOpacityChange,
  onTrailPointThresholdChange
}: {
  mouseGestureSettings: EditorMouseGestureSettings;
  onActionChange: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => void;
  onSegmentThresholdChange: (value: number) => void;
  onTrailColorChange: (value: string) => void;
  onTrailLineWidthChange: (value: number) => void;
  onTrailOpacityChange: (value: number) => void;
  onTrailPointThresholdChange: (value: number) => void;
}) {
  return (
    <>
      <MouseGestureAreaSection />
      <MouseGestureBindingsSection gestureActions={mouseGestureSettings.gestureActions} onActionChange={onActionChange} />
      <MouseGestureTrailSection
        mouseGestureSettings={mouseGestureSettings}
        onTrailColorChange={onTrailColorChange}
        onTrailLineWidthChange={onTrailLineWidthChange}
        onTrailOpacityChange={onTrailOpacityChange}
      />
      <MouseGestureThresholdsSection
        mouseGestureSettings={mouseGestureSettings}
        onSegmentThresholdChange={onSegmentThresholdChange}
        onTrailPointThresholdChange={onTrailPointThresholdChange}
      />
    </>
  );
}
