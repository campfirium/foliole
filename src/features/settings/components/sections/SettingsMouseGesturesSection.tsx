import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

import { parseLiteralUnion } from '../../../../shared/lib/parseLiteralUnion';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
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
  gestureId: EditorMouseGestureId;
  descriptionKey: TranslationKey;
  labelKey: TranslationKey;
}> = [
  { gestureId: 'left', labelKey: 'settings.mouseGestures.gesture.left', descriptionKey: 'settings.mouseGestures.gesture.reserved' },
  { gestureId: 'right', labelKey: 'settings.mouseGestures.gesture.right', descriptionKey: 'settings.mouseGestures.gesture.reserved' },
  { gestureId: 'left-up', labelKey: 'settings.mouseGestures.gesture.leftUp', descriptionKey: 'settings.mouseGestures.gesture.topShortcut' },
  { gestureId: 'left-down', labelKey: 'settings.mouseGestures.gesture.leftDown', descriptionKey: 'settings.mouseGestures.gesture.bottomShortcut' }
];

const ACTION_LABEL_KEYS: Record<EditorMouseGestureActionSetting, TranslationKey> = {
  disabled: 'settings.mouseGestures.action.disabled',
  'scroll-top': 'settings.mouseGestures.action.scrollTop',
  'scroll-bottom': 'settings.mouseGestures.action.scrollBottom'
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
  const t = useTranslation();
  return (
    <SettingsSection
      ariaLabel={t('settings.mouseGestures.area.sectionAria')}
      title={t('settings.mouseGestures.area.title')}
    >
      <SettingsRow
        {...settingsSearchRowProps(MOUSE_GESTURE_ROW.activeArea)}
        description={MOUSE_GESTURE_ROW.activeArea.description}
        readonly
        title={MOUSE_GESTURE_ROW.activeArea.title}
      >
        <SettingsControlSlot>
          <div className={settingsValueBoxClassName('w-full text-foreground')}>
            {t('settings.mouseGestures.area.mainPanel')}
          </div>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function MouseGestureBindingsSection(props: {
  onActionChange: (gestureId: EditorMouseGestureId, action: EditorMouseGestureActionSetting) => void;
}) {
  const t = useTranslation();
  const { settings } = useMouseGestureSettings();
  return (
    <SettingsSection
      ariaLabel={t('settings.mouseGestures.bindings.sectionAria')}
      title={t('settings.mouseGestures.bindings.title')}
    >
      {GESTURE_ROWS.map((gesture) => {
        const label = t(gesture.labelKey);
        return (
        <SettingsRow description={t(gesture.descriptionKey)} key={gesture.gestureId} title={label}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <GestureIcon gestureId={gesture.gestureId} />
            <select
              aria-label={t('settings.mouseGestures.action.aria', { label })}
              className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
              onChange={(event) => {
                const action = parseLiteralUnion(event.target.value, EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS);
                if (action) props.onActionChange(gesture.gestureId, action);
              }}
              value={settings.gestureActions[gesture.gestureId]}
            >
              {EDITOR_MOUSE_GESTURE_ACTION_SETTING_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {t(ACTION_LABEL_KEYS[action])}
                </option>
              ))}
            </select>
          </SettingsControlSlot>
        </SettingsRow>
        );
      })}
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
