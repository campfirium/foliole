import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import {
  AppInput,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedControl,
  settingsResetButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import {
  DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX,
  getHighlightAnnotationPrefix,
  setHighlightAnnotationPrefix
} from '../../../editor/model/highlightAnnotationPrefixSetting';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

function HighlightAnnotationPrefixRow() {
  const [prefix, setPrefix] = useState(() => getHighlightAnnotationPrefix());
  const updatePrefix = (value: string) => {
    setPrefix(setHighlightAnnotationPrefix(value));
  };

  return (
    <SettingsRow
      description="Inserted before annotation text when creating or adding a highlight annotation."
      title="Highlight annotation prefix"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label="Reset highlight annotation prefix"
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={prefix === DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}
            onClick={() => updatePrefix(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label="Highlight annotation prefix"
            className={SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME}
            maxLength={24}
            onChange={(event) => updatePrefix(event.target.value)}
            value={prefix}
          />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsEditorSection() {
  const {
    autoLocalizeRemoteImages,
    markdownSyntaxVisibility,
    setAutoLocalizeRemoteImages,
    setMarkdownSyntaxVisibility
  } = useAppearanceSettings();

  return (
    <SettingsSection ariaLabel="Editor settings section" title="Live markdown">
      <SettingsRow
        description="Automatically copy remote pictures in topics into your local library so they stay available offline."
        title="Save remote images locally"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-checked={autoLocalizeRemoteImages}
            aria-label="Save remote images locally"
            className={settingsSwitchClassName(autoLocalizeRemoteImages)}
            onClick={() => setAutoLocalizeRemoteImages(!autoLocalizeRemoteImages)}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={settingsSwitchKnobClassName(autoLocalizeRemoteImages)}
            />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description="Show markdown syntax markers on the active line, or keep them hidden everywhere."
        title="Show markdown syntax markers"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <SettingsSegmentedControl
            ariaLabel="Markdown syntax visibility"
            onChange={(value) => setMarkdownSyntaxVisibility(value as typeof markdownSyntaxVisibility)}
            options={[
              { label: 'Hidden', value: 'hidden' },
              { label: 'Active line', value: 'visible' }
            ]}
            value={markdownSyntaxVisibility}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <HighlightAnnotationPrefixRow />
    </SettingsSection>
  );
}
