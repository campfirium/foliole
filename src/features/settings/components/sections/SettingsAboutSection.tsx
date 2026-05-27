import { useEffect, useState } from 'react';

import { exportDiagnosticBundle } from '../../../../shared/platform/diagnosticBundle';
import {
  isSearchEnhancementEnabled,
  updateSearchEnhancementEnabled
} from '../../../../shared/platform/searchEnhancementSettings';
import {
  loadSearchIndexRebuildStatus,
  onSearchIndexRebuildStatus,
  type SearchIndexRebuildStatus
} from '../../../../shared/platform/searchIndexRebuildStatus';
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
  const [status, setStatus] = useState<SearchIndexRebuildStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSearchIndexRebuildStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    const unsubscribe = onSearchIndexRebuildStatus((nextStatus) => {
      setStatus(nextStatus);
      setError(null);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const updateEnabled = async (nextEnabled: boolean) => {
    setIsUpdating(true);
    setError(null);
    try {
      const nextStatus = await updateSearchEnhancementEnabled(nextEnabled);
      setEnabled(nextEnabled);
      setStatus(nextStatus);
    } catch {
      setEnabled(isSearchEnhancementEnabled());
      setError(nextEnabled ? 'Could not enable enhanced search.' : 'Could not turn off enhanced search.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SettingsRow
      description={<SearchEnhancementDescription statusCopy={getSearchEnhancementStatusCopy(status, error)} />}
      title="Search enhancement"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={enabled}
          aria-label="Search enhancement"
          className={settingsSwitchClassName(enabled)}
          disabled={isUpdating}
          onClick={() => void updateEnabled(!enabled)}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function SearchEnhancementDescription(props: { statusCopy: string | null }) {
  return (
    <>
      <span className="block">
        Improves search for Chinese, Japanese, Korean, and other languages that are not separated by spaces. Uses more search data.
      </span>
      {props.statusCopy ? <span className="mt-1 block text-foreground/70">{props.statusCopy}</span> : null}
    </>
  );
}

function getSearchEnhancementStatusCopy(status: SearchIndexRebuildStatus | null, error: string | null) {
  if (error) return error;
  if (!status) return null;
  if (status.status === 'rebuilding') return 'Preparing search...';
  if (status.status === 'failed') return status.strategy === 'cjk-trigram'
    ? 'Could not enable enhanced search.'
    : 'Could not turn off enhanced search.';
  return status.strategy === 'cjk-trigram' ? 'Enhanced search is ready.' : 'Search is ready.';
}

export function SettingsAboutSection() {
  return <ApplicationInfo />;
}
