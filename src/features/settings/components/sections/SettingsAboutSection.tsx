import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { copyDiagnosticReport } from '../../../../shared/platform/diagnosticBundle';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import {
  SettingsAppSection,
  SettingsCommunitySection
} from './SettingsSupportSection';

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
        <button
          aria-label={t('settings.about.diagnostic.copy')}
          className={settingsButtonClassName()}
          disabled={isExporting}
          onClick={() => void handleExport()}
          type="button"
        >
          {isExporting ? t('settings.about.diagnostic.copying') : t('settings.about.diagnostic.copyButton')}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function ApplicationInfo(props: { onRunSupportCommand?: ((commandId: string) => void) | undefined }) {
  const t = useTranslation();
  return (
    <>
      <SettingsAppSection onRunSupportCommand={props.onRunSupportCommand} />
      <SettingsSection ariaLabel={t('settings.about.support.aria')} title={t('settings.about.support.section')}>
        <DiagnosticExportRow />
      </SettingsSection>
      <SettingsCommunitySection onRunSupportCommand={props.onRunSupportCommand} />
    </>
  );
}

export function SettingsAboutSection(props: { onRunSupportCommand?: ((commandId: string) => void) | undefined }) {
  return <ApplicationInfo {...props} />;
}
