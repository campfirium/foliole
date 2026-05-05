import { SettingsRow, SettingsSection } from '../../../../shared/ui';

function ApplicationInfo() {
  return (
    <SettingsSection ariaLabel="About settings section">
      <SettingsRow description="Reader-first outlining and review workflow built with Electron + React." readonly title="Foliole desktop">
        <span className="rounded-full border border-settings-divider bg-bg-elevated px-2.5 py-1 text-[0.82rem] text-foreground/70">
          v0.1.0
        </span>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsAboutSection() {
  return <ApplicationInfo />;
}
