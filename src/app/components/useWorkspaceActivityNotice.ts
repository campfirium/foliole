import { useCallback, useEffect, useState } from 'react';

import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  getFormalImportFailureMessage,
  getFormalImportLatestResult
} from '../hooks/useFormalImport';

import type { ClipboardImportRequestDetail } from './importActivityRequests';
import type { WorkspaceActivityNoticeTone } from './WorkspaceActivityNotice';

interface WorkspaceActivityNoticeState {
  id: number;
  message: string;
  nodeId: string | null;
  tone: WorkspaceActivityNoticeTone;
}

const NOTICE_TIMEOUT_MS = 3600;
type ImportNoticeKind = 'clipboard' | 'file';

function formatLoadingMessage(kind: ImportNoticeKind, t: Translate) {
  return t(kind === 'clipboard'
    ? 'desktop.workspaceActivity.import.clipboard.loading'
    : 'desktop.workspaceActivity.import.file.loading');
}

function formatFailureMessage(message: string | null, t: Translate) {
  return message === 'Unknown import failure' ? t('desktop.importOverview.unknownFailure') : message;
}

function resolveImportNotice(id: number, kind: ImportNoticeKind, imported: boolean, t: Translate): WorkspaceActivityNoticeState {
  const latestImport = imported ? getFormalImportLatestResult() : null;
  const didImport = imported && latestImport?.resultStatus !== 'failed';
  const nodeId = didImport ? latestImport?.nodeId ?? null : null;
  const failureMessage = didImport ? null : formatFailureMessage(getFormalImportFailureMessage(), t);
  const importedMessage = t(kind === 'clipboard'
    ? 'desktop.workspaceActivity.import.clipboard.imported'
    : 'desktop.workspaceActivity.import.file.imported');
  const importedToInboxMessage = t(kind === 'clipboard'
    ? 'desktop.workspaceActivity.import.clipboard.importedToInbox'
    : 'desktop.workspaceActivity.import.file.importedToInbox');
  const emptyMessage = t(kind === 'clipboard'
    ? 'desktop.workspaceActivity.import.clipboard.empty'
    : 'desktop.workspaceActivity.import.file.empty');

  return {
    id,
    message: didImport
      ? nodeId
        ? importedMessage
        : importedToInboxMessage
      : (failureMessage ?? emptyMessage),
    nodeId,
    tone: didImport ? 'success' : 'error'
  };
}

export function useWorkspaceActivityNotice(
  onStartClipboardImport: (detail?: ClipboardImportRequestDetail) => boolean | Promise<boolean>,
  onStartFileImport: (options?: { onImportStarted?: () => void }) => boolean | Promise<boolean>,
  onOpenImportedTopic: (nodeId: string) => void
) {
  const t = useTranslation();
  const [notice, setNotice] = useState<WorkspaceActivityNoticeState | null>(null);

  useEffect(() => {
    if (!notice || notice.tone === 'loading') {
      return;
    }
    const timeout = window.setTimeout(() => setNotice((current) => (current?.id === notice.id ? null : current)), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const startImport = useCallback(async (kind: ImportNoticeKind, runner: () => boolean | Promise<boolean>) => {
    const id = Date.now();
    setNotice({ id, message: formatLoadingMessage(kind, t), nodeId: null, tone: 'loading' });
    const imported = await runner();
    setNotice(resolveImportNotice(id, kind, imported, t));
    return imported;
  }, [t]);

  const startClipboardImport = useCallback(
    (detail?: ClipboardImportRequestDetail) => startImport('clipboard', () => onStartClipboardImport(detail)),
    [onStartClipboardImport, startImport]
  );

  const startFileImport = useCallback(
    async () => {
      const id = Date.now();
      let didStartImport = false;
      const imported = await onStartFileImport({
        onImportStarted: () => {
          didStartImport = true;
          setNotice({ id, message: formatLoadingMessage('file', t), nodeId: null, tone: 'loading' });
        }
      });
      if (didStartImport || imported) {
        setNotice(resolveImportNotice(id, 'file', imported, t));
      }
      return imported;
    },
    [onStartFileImport, t]
  );

  const openImportedTopic = useCallback(() => {
    if (!notice?.nodeId) {
      return;
    }
    onOpenImportedTopic(notice.nodeId);
    setNotice(null);
  }, [notice?.nodeId, onOpenImportedTopic]);

  return { notice, openImportedTopic, startClipboardImport, startFileImport };
}
