import { useEffect } from 'react';

import { getDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { CLIPBOARD_IMPORT_REQUEST_EVENT, FILE_IMPORT_REQUEST_EVENT } from './importActivityRequests';
import type { useWorkspaceActivityNotice } from './useWorkspaceActivityNotice';

export function useWorkspaceImportRequests(controller: ReturnType<typeof useWorkspaceActivityNotice>) {
  useEffect(() => {
    if (getDemoRuntimeState().isDemo) return undefined;
    const handleClipboardRequest = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? event.detail as { targetParentNodeId?: string } | undefined
        : undefined;
      void controller.startClipboardImport(detail);
    };
    const handleFileRequest = () => void controller.startFileImport();
    window.addEventListener(CLIPBOARD_IMPORT_REQUEST_EVENT, handleClipboardRequest);
    window.addEventListener(FILE_IMPORT_REQUEST_EVENT, handleFileRequest);
    return () => {
      window.removeEventListener(CLIPBOARD_IMPORT_REQUEST_EVENT, handleClipboardRequest);
      window.removeEventListener(FILE_IMPORT_REQUEST_EVENT, handleFileRequest);
    };
  }, [controller.startClipboardImport, controller.startFileImport]);
}
