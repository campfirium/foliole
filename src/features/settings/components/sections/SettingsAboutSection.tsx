import { Mail, MessageSquare } from 'lucide-react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { isDesktopRuntime } from '../../../../shared/platform/runtime';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsCliSection } from './SettingsCliSection';
import { SettingsLogRow } from './SettingsLogRow';
import {
  SettingsAppSection,
  SettingsCommunitySection
} from './SettingsSupportSection';

function FeedbackRow(props: { onRunSupportCommand?: ((commandId: string) => void) | undefined }) {
  const t = useTranslation();
  const feedbackRow = useLocalizedSettingsSearchRow('about-feedback');
  return (
    <SettingsRow
      {...settingsSearchRowProps(feedbackRow)}
      description={feedbackRow.description}
      title={feedbackRow.title}
    >
      <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} flex flex-wrap justify-end gap-2`}>
        <button
          className={settingsButtonClassName('gap-2')}
          disabled={!props.onRunSupportCommand}
          onClick={() => props.onRunSupportCommand?.(APP_COMMAND_IDS.sendFeedback)}
          type="button"
        >
          <MessageSquare aria-hidden="true" className="size-4 shrink-0 text-settings-icon-active" strokeWidth={1.8} />
          {t('settings.about.feedback')}
        </button>
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <button
              className={settingsButtonClassName('gap-2')}
              disabled={!props.onRunSupportCommand}
              onClick={() => props.onRunSupportCommand?.(APP_COMMAND_IDS.openSupportEmail)}
              title="hello@foliole.app"
              type="button"
            >
              <Mail aria-hidden="true" className="size-4 shrink-0 text-settings-icon-active" strokeWidth={1.8} />
              {t('settings.about.emailSupport')}
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent layer="dropdown" side="top">hello@foliole.app</AppTooltipContent>
        </AppTooltip>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

interface SettingsAboutSectionProps {
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  previewDesktopSettings?: boolean;
}

function ApplicationInfo(props: SettingsAboutSectionProps) {
  const t = useTranslation();
  return (
    <>
      {props.previewDesktopSettings ? null : <SettingsAppSection onRunSupportCommand={props.onRunSupportCommand} />}
      {props.previewDesktopSettings ? null : <SettingsCliSection />}
      <SettingsSection ariaLabel={t('settings.about.support.aria')} title={t('settings.about.support.section')}>
        <FeedbackRow onRunSupportCommand={props.onRunSupportCommand} />
        {isDesktopRuntime() ? <SettingsLogRow /> : null}
      </SettingsSection>
      <SettingsCommunitySection onRunSupportCommand={props.onRunSupportCommand} />
    </>
  );
}

export function SettingsAboutSection(props: SettingsAboutSectionProps) {
  return <ApplicationInfo {...props} />;
}
