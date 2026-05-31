import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { ABOUT_SETTINGS_SEARCH_ROWS } from '../../model/settingsSearchRowCatalog';

const ABOUT_ROW = {
  app: ABOUT_SETTINGS_SEARCH_ROWS[0]!,
  community: ABOUT_SETTINGS_SEARCH_ROWS[3]!
};

interface SettingsSupportSectionProps {
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
}

function SupportButton(props: {
  children: string;
  className?: string;
  commandId: string;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
}) {
  return (
    <button
      className={settingsButtonClassName(props.className)}
      disabled={!props.onRunSupportCommand}
      onClick={() => props.onRunSupportCommand?.(props.commandId)}
      type="button"
    >
      {props.children}
    </button>
  );
}

function VersionBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  return (
    <SettingsRow
      {...settingsSearchRowProps(ABOUT_ROW.app)}
      description="Current Foliole desktop version."
      title="Version 0.60"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SupportButton commandId={APP_COMMAND_IDS.openLatestRelease} onRunSupportCommand={onRunSupportCommand}>
          Open releases
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.checkForUpdates} onRunSupportCommand={onRunSupportCommand}>
          Check for Updates
        </SupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function QuickLinksBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  return (
    <SettingsRow
      {...settingsSearchRowProps(ABOUT_ROW.community)}
      description={ABOUT_ROW.community.description}
      title={ABOUT_ROW.community.title}
    >
      <SettingsControlSlot className="flex-wrap">
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubRepository} onRunSupportCommand={onRunSupportCommand}>
          GitHub
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubDiscussions} onRunSupportCommand={onRunSupportCommand}>
          Discussions
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubIssues} onRunSupportCommand={onRunSupportCommand}>
          Feedback
        </SupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsSupportSection({ onRunSupportCommand }: SettingsSupportSectionProps) {
  return (
    <SettingsSection ariaLabel="About settings section">
      <VersionBlock onRunSupportCommand={onRunSupportCommand} />
      <QuickLinksBlock onRunSupportCommand={onRunSupportCommand} />
    </SettingsSection>
  );
}
