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
    </SettingsSection>
  );
}
