import { useCallback } from 'react';
import { create } from 'zustand';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { selectRuntimeImportTextFile } from '../../shared/platform/importBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

export interface FormalImportStatus {
  failures: string;
  inboxLanding: string;
  lastRun: string;
}

const DEFAULT_FORMAL_IMPORT_STATUS: FormalImportStatus = {
  failures: 'Nothing recorded',
  inboxLanding: 'Imported files land as child nodes under Inbox',
  lastRun: 'No imports yet'
};

interface FormalImportUiState {
  isImporting: boolean;
  status: FormalImportStatus;
}

const useFormalImportState = create<FormalImportUiState>(() => ({
  isImporting: false,
  status: DEFAULT_FORMAL_IMPORT_STATUS
}));

function formatImportTimestamp(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

export function resetFormalImportState() {
  useFormalImportState.setState({
    isImporting: false,
    status: DEFAULT_FORMAL_IMPORT_STATUS
  });
}

export function useFormalImport() {
  const createChildNode = useWorkspaceStore((state) => state.createChildNode);
  const isImporting = useFormalImportState((state) => state.isImporting);
  const status = useFormalImportState((state) => state.status);
  const isAvailable = Boolean(getRuntimeInvoke());

  const startImport = useCallback(async () => {
    if (useFormalImportState.getState().isImporting) {
      return false;
    }

    useFormalImportState.setState({ isImporting: true });
    try {
      const importedFile = await selectRuntimeImportTextFile();
      if (!importedFile) {
        useFormalImportState.setState((current) => ({
          isImporting: false,
          status: {
            ...current.status,
            lastRun: 'Import cancelled'
          }
        }));
        return false;
      }

      createChildNode(INBOX_NODE_ID, importedFile.content);
      useFormalImportState.setState({
        isImporting: false,
        status: {
          failures: 'Nothing recorded',
          inboxLanding: `Inbox child created from ${importedFile.fileName}`,
          lastRun: `Imported ${importedFile.fileName} · ${formatImportTimestamp(new Date().toISOString())}`
        }
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown import failure';
      useFormalImportState.setState({
        isImporting: false,
        status: {
          ...useFormalImportState.getState().status,
          failures: message,
          lastRun: 'Import failed'
        }
      });
      return false;
    }
  }, [createChildNode]);

  return {
    isAvailable,
    isImporting,
    startImport,
    status
  };
}
