import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

import { parseLiteralUnion } from '../../../../shared/lib/parseLiteralUnion';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName,
  settingsValueBoxClassName
} from '../../../../shared/ui';
import type { EditorMouseGestureId } from '../../../editor/model/editorMouseGestures';
import {
  EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS,
  type EditorMouseGestureActionSetting
} from '../../../editor/model/editorMouseGestureSettings';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import {
  MOUSE_GESTURE_SETTINGS_SEARCH_ROWS
} from '../../model/settingsSearchRowCatalog';

import {
  MouseGestureThresholdsSection,
  MouseGestureTrailSection
} from './SettingsMouseGestureAdvancedSections';

const MOUSE_GESTURE_ROW = {
  activeArea: MOUSE_GESTURE_SETTINGS_SEARCH_ROWS[0]!
};

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

function MouseGestureAreaSection() {
  return (
    <SettingsSection
      ariaLabel="Mouse gesture area section"
      title="Area"
    >
      <SettingsRow
        {...settingsSearchRowProps(MOUSE_GESTURE_ROW.activeArea)}
        description={MOUSE_GESTURE_ROW.activeArea.description}
        readonly
        title={MOUSE_GESTURE_ROW.activeArea.title}
      >
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
              onChange={(event) => {
                const action = parseLiteralUnion(event.target.value, EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS);
                if (action) props.onActionChange(gesture.gestureId, action);
              }}
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
