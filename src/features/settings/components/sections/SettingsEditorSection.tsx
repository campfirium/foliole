import { SettingsControlSlot, SettingsRow, SettingsSection, settingsFieldClassName } from '../../../../shared/ui';
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
        <SettingsControlSlot>
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              aria-label="Auto-localize remote images"
              checked={autoLocalizeRemoteImages}
              className="h-4 w-4 rounded border border-border"
              onChange={(event) => setAutoLocalizeRemoteImages(event.target.checked)}
              type="checkbox"
            />
            <span>{autoLocalizeRemoteImages ? 'On' : 'Off'}</span>
          </label>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description="Show markdown markers on active line, or keep them hidden."
        title="Markdown syntax visibility"
      >
        <SettingsControlSlot>
          <span className="sr-only">Markdown syntax visibility</span>
          <select
            className={settingsFieldClassName()}
            onChange={(event) => setMarkdownSyntaxVisibility(event.target.value as typeof markdownSyntaxVisibility)}
            value={markdownSyntaxVisibility}
          >
            <option value="hidden">Hidden</option>
            <option value="visible">Visible on active line</option>
          </select>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
