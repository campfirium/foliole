import { SettingsControlSlot, SettingsRow, SettingsSection, settingsValueBoxClassName } from '../../../../shared/ui';

function ApplicationInfo() {
  return (
    <SettingsSection ariaLabel="About settings section">
      <SettingsRow description="Reader-first outlining and review workflow built with Electron + React." readonly title="Foliole desktop">
        <SettingsControlSlot>
          <span className={settingsValueBoxClassName('rounded-full px-2.5 py-1 text-[0.82rem]')}>
            v0.1.0
          </span>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsAboutSection() {
  return <ApplicationInfo />;
}
