import { useEffect, useState } from 'react';

import { isReadwiseReaderConfigReady } from '../../../lib/core/import/readwiseReaderSettings';
import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import { ReadwiseReaderConfigDialogHost } from './importSourceWorkspaceDialogs';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function WorkspaceSettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  const importSettings = useImportSourceWorkspaceState();
  const [isReadwiseDialogOpen, setIsReadwiseDialogOpen] = useState(false);

  useEffect(() => {
    if (!props.isSettingsOpen) {
      setIsReadwiseDialogOpen(false);
      return;
    }
    if (props.requestedSettingsDialog === 'readwise-reader') {
      setIsReadwiseDialogOpen(true);
    }
  }, [props.isSettingsOpen, props.requestedSettingsDialog]);

  if (!props.isSettingsOpen) {
    return null;
  }

  return (
    <>
      <SettingsPanel
        onClose={props.onCloseSettings}
        onOpenReadwiseReaderSettings={() => setIsReadwiseDialogOpen(true)}
        readwiseReaderConfigured={
          importSettings.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(importSettings.readwiseReaderConfig)
        }
        requestedCategory={props.requestedSettingsCategory}
      />
      <ReadwiseReaderConfigDialogHost
        configDialogOpen={isReadwiseDialogOpen}
        onOpenChange={setIsReadwiseDialogOpen}
        onSave={importSettings.handleSaveReadwiseReaderSetup}
        readwiseReaderConfig={importSettings.readwiseReaderConfig}
        readwiseRootPath={importSettings.readwiseRootPath}
        readwiseSources={importSettings.readwiseSources}
      />
    </>
  );
}
