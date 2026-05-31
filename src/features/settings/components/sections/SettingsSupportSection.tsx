import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import {
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
    <div
      {...settingsSearchRowProps(ABOUT_ROW.app)}
      className="grid gap-4 px-5 py-4 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-start"
    >
      <div className="min-w-0">
        <h3 className="text-[1.05rem] font-semibold text-foreground">Version 0.60</h3>
        <button
          className="mt-1 block text-left text-sm leading-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={!onRunSupportCommand}
          onClick={() => onRunSupportCommand?.(APP_COMMAND_IDS.openLatestRelease)}
          type="button"
        >
          Open releases
        </button>
      </div>
      <SupportButton className="w-fit" commandId={APP_COMMAND_IDS.checkForUpdates} onRunSupportCommand={onRunSupportCommand}>
        Check for Updates
      </SupportButton>
    </div>
  );
}

function QuickLinksBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  return (
    <div
      {...settingsSearchRowProps(ABOUT_ROW.community)}
      className="mx-5 mb-5 grid gap-4 rounded-md border border-settings-control-border bg-settings-control px-4 py-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center"
    >
      <div className="min-w-0">
        <h3 className="text-[1.05rem] font-semibold text-foreground">Quick links</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Open the main project links for feedback and GitHub support.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubIssues} onRunSupportCommand={onRunSupportCommand}>
          Feedback
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubRepository} onRunSupportCommand={onRunSupportCommand}>
          GitHub
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubDiscussions} onRunSupportCommand={onRunSupportCommand}>
          Discussions
        </SupportButton>
      </div>
    </div>
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
