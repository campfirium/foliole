import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedControl,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

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
        description="Download remote markdown images into the app and rewrite them to local links when possible."
        title="Auto-localize remote images"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-checked={autoLocalizeRemoteImages}
            aria-label="Auto-localize remote images"
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
        description="Show markdown markers on active line, or keep them hidden."
        title="Markdown syntax visibility"
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
    </SettingsSection>
  );
}
