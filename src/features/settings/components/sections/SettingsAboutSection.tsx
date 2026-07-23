import { Mail, MessageSquare } from 'lucide-react';
import { useState } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { copyDiagnosticReport } from '../../../../shared/platform/diagnosticBundle';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsCliSection } from './SettingsCliSection';
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
          <AppTooltipContent className="[z-index:var(--z-dropdown)]" side="top">hello@foliole.app</AppTooltipContent>
        </AppTooltip>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function DiagnosticExportRow() {
  const t = useTranslation();
  const diagnosticBundleRow = useLocalizedSettingsSearchRow('about-diagnostic-report');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const description = (
    <>
      <span className="block">{t('settings.about.diagnostic.description')}</span>
      {feedback ? <span className="mt-1 block text-foreground/70">{feedback}</span> : null}
      {error ? <span className="mt-1 block text-error">{error}</span> : null}
    </>
  );
  const handleExport = async () => {
    setError(null);
    setFeedback(null);
    setIsExporting(true);
    try {
      const result = await copyDiagnosticReport();
      if (result.status === 'unavailable') {
        setFeedback(t('settings.about.diagnostic.desktopOnly'));
        return;
      }
      await navigator.clipboard.writeText(result.reportText);
      setFeedback(t('settings.about.diagnostic.copied'));
    } catch {
      setError(t('settings.about.diagnostic.copyFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SettingsRow
      {...settingsSearchRowProps(diagnosticBundleRow)}
      description={description}
      title={diagnosticBundleRow.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsButton
          aria-label={t('settings.about.diagnostic.copy')}
          loading={isExporting}
          loadingLabel={t('settings.about.diagnostic.copying')}
          onClick={() => void handleExport()}
        >
          {t('settings.about.diagnostic.copyButton')}
        </SettingsButton>
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
        <DiagnosticExportRow />
      </SettingsSection>
      <SettingsCommunitySection onRunSupportCommand={props.onRunSupportCommand} />
    </>
  );
}

export function SettingsAboutSection(props: SettingsAboutSectionProps) {
  return <ApplicationInfo {...props} />;
}
