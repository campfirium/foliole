import {
  Github,
  Youtube
} from 'lucide-react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsSupportButton } from './SettingsSupportButton';
import { SettingsVersionBlock } from './SettingsVersionBlock';

interface SettingsSupportSectionProps {
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
}

function QuickLinksBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  const communityRow = useLocalizedSettingsSearchRow('about-community');
  return (
    <SettingsRow
      {...settingsSearchRowProps(communityRow)}
      description={communityRow.description}
      title={communityRow.title}
    >
      <SettingsControlSlot className="flex-wrap">
        <SettingsSupportButton commandId={APP_COMMAND_IDS.openGitHubRepository} icon={Github} onRunSupportCommand={onRunSupportCommand}>
          GitHub
        </SettingsSupportButton>
        <SettingsSupportButton commandId={APP_COMMAND_IDS.openGitHubDiscussions} icon={Github} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.discussions')}
        </SettingsSupportButton>
        <SettingsSupportButton commandId={APP_COMMAND_IDS.openGitHubIssues} icon={Github} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.issues')}
        </SettingsSupportButton>
        <SettingsSupportButton
          commandId={APP_COMMAND_IDS.openYouTubePlaylist}
          icon={Youtube}
          onRunSupportCommand={onRunSupportCommand}
        >
          YouTube
        </SettingsSupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsAppSection({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.about.app.aria')} title={t('settings.about.app.section')}>
      <SettingsVersionBlock onRunSupportCommand={onRunSupportCommand} />
    </SettingsSection>
  );
}

export function SettingsCommunitySection({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.about.community.aria')} title={t('settings.about.community.section')}>
      <QuickLinksBlock onRunSupportCommand={onRunSupportCommand} />
    </SettingsSection>
  );
}
