import { useState } from 'react';

import { exportDiagnosticBundle } from '../../../../shared/platform/diagnosticBundle';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName,
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
  );
}

export function SettingsAboutSection() {
  return <ApplicationInfo />;
}
