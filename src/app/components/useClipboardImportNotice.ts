import { useCallback, useEffect, useState } from 'react';

import {
  getFormalImportFailureMessage,
  getFormalImportLatestResult
} from '../hooks/useFormalImport';

import type { ClipboardImportNoticeTone } from './ClipboardImportNotice';

interface ClipboardImportNoticeState {
  id: number;
  message: string;
  nodeId: string | null;
  tone: ClipboardImportNoticeTone;
}

const NOTICE_TIMEOUT_MS = 3600;
type ImportNoticeKind = 'clipboard' | 'file';

const LOADING_MESSAGES: Record<ImportNoticeKind, string> = {
  clipboard: 'Importing clipboard...',
  file: 'Importing file...'
};

function resolveImportNotice(id: number, kind: ImportNoticeKind, imported: boolean): ClipboardImportNoticeState {
  const latestImport = imported ? getFormalImportLatestResult() : null;
  const didImport = imported && latestImport?.resultStatus !== 'failed';
  const nodeId = didImport ? latestImport?.nodeId ?? null : null;
  const failureMessage = didImport ? null : getFormalImportFailureMessage();
  const importedMessage = kind === 'clipboard' ? 'Clipboard imported' : 'File imported';
  const importedToInboxMessage = kind === 'clipboard' ? 'Clipboard imported to Inbox' : 'File imported to Inbox';
  const emptyMessage = kind === 'clipboard' ? 'No supported clipboard content found' : 'No file imported';

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

export function useClipboardImportNotice(
  onStartClipboardImport: () => boolean | Promise<boolean>,
  onStartFileImport: () => boolean | Promise<boolean>,
  onOpenImportedTopic: (nodeId: string) => void
) {
  const [notice, setNotice] = useState<ClipboardImportNoticeState | null>(null);

  useEffect(() => {
    if (!notice || notice.tone === 'loading') {
      return;
    }
    const timeout = window.setTimeout(() => setNotice((current) => (current?.id === notice.id ? null : current)), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const startImport = useCallback(async (kind: ImportNoticeKind, runner: () => boolean | Promise<boolean>) => {
    const id = Date.now();
    setNotice({ id, message: LOADING_MESSAGES[kind], nodeId: null, tone: 'loading' });
    const imported = await runner();
    setNotice(resolveImportNotice(id, kind, imported));
    return imported;
  }, []);

  const startClipboardImport = useCallback(
    () => startImport('clipboard', onStartClipboardImport),
    [onStartClipboardImport, startImport]
  );

  const startFileImport = useCallback(
    () => startImport('file', onStartFileImport),
    [onStartFileImport, startImport]
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
