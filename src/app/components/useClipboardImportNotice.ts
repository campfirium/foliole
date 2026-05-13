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

function resolveClipboardImportNotice(id: number, imported: boolean): ClipboardImportNoticeState {
  const latestImport = imported ? getFormalImportLatestResult() : null;
  const didImport = imported && latestImport?.resultStatus !== 'failed';
  const nodeId = didImport ? latestImport?.nodeId ?? null : null;
  const failureMessage = didImport ? null : getFormalImportFailureMessage();

  return {
    id,
    message: didImport
      ? nodeId
        ? 'Clipboard imported'
        : 'Clipboard imported to Inbox'
      : (failureMessage ?? 'No supported clipboard content found'),
    nodeId,
    tone: didImport ? 'success' : 'error'
  };
}

export function useClipboardImportNotice(
  onStartClipboardImport: () => boolean | Promise<boolean>,
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

  const startClipboardImport = useCallback(async () => {
    const id = Date.now();
    setNotice({ id, message: 'Importing clipboard...', nodeId: null, tone: 'loading' });
    const imported = await onStartClipboardImport();
    setNotice(resolveClipboardImportNotice(id, imported));
    return imported;
  }, [onStartClipboardImport]);

  const openImportedTopic = useCallback(() => {
    if (!notice?.nodeId) {
      return;
    }
    onOpenImportedTopic(notice.nodeId);
    setNotice(null);
  }, [notice?.nodeId, onOpenImportedTopic]);

  return { notice, openImportedTopic, startClipboardImport };
}
