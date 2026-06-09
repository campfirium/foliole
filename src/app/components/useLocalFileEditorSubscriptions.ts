import { useEffect } from 'react';

import { subscribeLocalFileOpened } from '../../shared/platform/localFileRuntimeRepository';

declare global {
  interface Window {
    __folioleFlushLocalFileBeforeClose?: () => Promise<boolean>;
  }
}

export function useLocalFileEditorSubscriptions(args: {
  checkDiskState: () => Promise<void>;
  flushSave: (force?: boolean) => Promise<boolean>;
  openPathAfterFlush: (path: string) => Promise<void>;
  refreshEntries: () => Promise<void>;
}) {
  useEffect(() => {
    window.__folioleFlushLocalFileBeforeClose = args.flushSave;
    return () => {
      if (window.__folioleFlushLocalFileBeforeClose === args.flushSave) {
        delete window.__folioleFlushLocalFileBeforeClose;
      }
    };
  }, [args.flushSave]);

  useEffect(() => {
    void args.refreshEntries();
    return subscribeLocalFileOpened((payload) => {
      if (payload.absolutePath) void args.openPathAfterFlush(payload.absolutePath);
    });
  }, [args]);
  useEffect(() => {
    const onFocus = () => void args.checkDiskState();
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void args.flushSave();
      }
    };
    const onPageHide = () => void args.flushSave();
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [args]);
}
