import { useState } from 'react';

import { exportDiagnosticBundle } from '../../../../shared/platform/diagnosticBundle';
import {
  isSearchEnhancementEnabled,
  setSearchEnhancementEnabled
} from '../../../../shared/platform/searchEnhancementSettings';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName,
  settingsValueBoxClassName
} from '../../../../shared/ui';

function DiagnosticExportRow() {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const description = (
    <>
      <span className="block">Create a local zip with logs and crash reports for support.</span>
      {feedback ? <span className="mt-1 block text-foreground/70">{feedback}</span> : null}
      {error ? <span className="mt-1 block text-error">{error}</span> : null}
    </>
  );
  const handleExport = async () => {
    setError(null);
    setFeedback(null);
    setIsExporting(true);
    try {
      const result = await exportDiagnosticBundle();
      if (result.status === 'unavailable') {
        setFeedback('Available in the desktop app.');
        return;
      }
      setFeedback(`Diagnostic bundle exported with ${result.includedFileCount} files.`);
    } catch {
      setError('Diagnostic bundle could not be exported.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SettingsRow description={description} title="Diagnostic bundle">
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label="Export diagnostic bundle"
          className={settingsButtonClassName()}
          disabled={isExporting}
          onClick={() => void handleExport()}
          type="button"
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function ApplicationInfo() {
  return (
    <>
      <SettingsSection ariaLabel="About settings section">
        <SettingsRow description="Reader-first outlining and review workflow built with Electron + React." readonly title="Foliole desktop">
          <SettingsControlSlot>
            <span className={settingsValueBoxClassName('rounded-full px-2.5 py-1 text-[0.82rem]')}>
              v0.1.0
            </span>
          </SettingsControlSlot>
        </SettingsRow>
        <DiagnosticExportRow />
      </SettingsSection>
      <SettingsSection ariaLabel="General search settings section" title="Search">
        <SearchEnhancementRow />
      </SettingsSection>
    </>
  );
}

function SearchEnhancementRow() {
  const [enabled, setEnabled] = useState(isSearchEnhancementEnabled);
  const updateEnabled = (nextEnabled: boolean) => {
    setSearchEnhancementEnabled(nextEnabled);
    setEnabled(nextEnabled);
  };

  return (
    <SettingsRow
      description="Improves search for Chinese, Japanese, Korean, and other languages that are not separated by spaces. Uses more search index storage."
      title="Search enhancement"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={enabled}
          aria-label="Search enhancement"
          className={settingsSwitchClassName(enabled)}
          onClick={() => updateEnabled(!enabled)}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsAboutSection() {
  return <ApplicationInfo />;
}
