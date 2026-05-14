import { useState } from 'react';

import type {
  ExternalSourceSettingsFolder,
  ExternalSourceSettingsFolderPatch
} from '../../../../shared/platform/externalSourceSettingsRepository';
import { clearLinkPanelBrowsingData } from '../../../../shared/platform/linkPanelBrowsingData';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsErrorState,
  SettingsLoadingState,
  SettingsRow,
  SettingsSection,
  SettingsStateAction,
  settingsButtonClassName
} from '../../../../shared/ui';

import { ExternalLibraryRow, ExternalLibraryTable } from './SettingsExternalSearchSectionParts';

interface SettingsExternalSearchSectionProps {
  error: string | null;
  feedback: string | null;
  folders: ExternalSourceSettingsFolder[];
  isDesktopRuntime: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onAddFolder: () => void;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onRetryLoad: () => void;
  onUpdateFolder: (folderId: string, patch: ExternalSourceSettingsFolderPatch) => void;
}

function LinkPanelBrowsingDataRow(props: { isDesktopRuntime: boolean }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const description = (
    <>
      <span className="block">Clear cookies, local storage, and other site data saved by link panels.</span>
      {feedback ? <span className="mt-1 block text-foreground/70">{feedback}</span> : null}
      {error ? <span className="mt-1 block text-error">{error}</span> : null}
    </>
  );
  const handleClear = async () => {
    setError(null);
    setFeedback(null);
    setIsClearing(true);
    try {
      const status = await clearLinkPanelBrowsingData();
      setFeedback(status === 'cleared' ? 'Link panel browsing data cleared.' : 'Available in the desktop app.');
    } catch {
      setError('Link panel browsing data could not be cleared.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <SettingsRow description={description} title="Link panel browsing data">
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label="Clear link panel browsing data"
          className={settingsButtonClassName()}
          disabled={!props.isDesktopRuntime || isClearing}
          onClick={() => void handleClear()}
          type="button"
        >
          {isClearing ? 'Clearing...' : 'Clear'}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsExternalSearchSection(props: SettingsExternalSearchSectionProps) {
  if (props.isLoading) {
    return (
      <SettingsSection
        ariaLabel="External sources section"
        description="Search, preview, and import content from folders that stay outside Foliole until you choose to bring them in."
        title="External sources"
      >
        <SettingsLoadingState description="Loading external source folders." title="Loading external sources" />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      ariaLabel="External sources section"
      description="Search, preview, and import content from folders that stay outside Foliole until you choose to bring them in."
      title="External sources"
    >
      <div className="min-w-0 overflow-hidden">
        <ExternalLibraryTable
          folders={props.folders}
          isDesktopRuntime={props.isDesktopRuntime}
          isSaving={props.isSaving}
          onAddFolder={props.onAddFolder}
        >
          {props.folders.map((folder) => (
            <ExternalLibraryRow
              folder={folder}
              isSaving={props.isSaving}
              key={folder.id}
              onChooseAttachmentRoot={props.onChooseAttachmentRoot}
              onChooseFolder={props.onChooseFolder}
              onRebuildIndex={props.onRebuildIndex}
              onRemoveFolder={props.onRemoveFolder}
              onUpdateFolder={props.onUpdateFolder}
            />
          ))}
        </ExternalLibraryTable>
      </div>
      <LinkPanelBrowsingDataRow isDesktopRuntime={props.isDesktopRuntime} />
      {props.error ? (
        <SettingsErrorState
          action={<SettingsStateAction label="Retry" onClick={props.onRetryLoad} />}
          description={props.error}
          title="External sources unavailable"
        />
      ) : null}
    </SettingsSection>
  );
}
