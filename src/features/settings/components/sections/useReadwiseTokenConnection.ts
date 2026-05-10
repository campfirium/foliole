import { useCallback, useEffect, useState } from 'react';

import {
  connectReadwiseTokenInRuntime,
  disconnectReadwiseTokenInRuntime,
  loadReadwiseTokenConnectionFromRuntime,
  syncReadwiseTokenLibraryInRuntime,
  type RuntimeReadwiseTokenConnection,
  type RuntimeReadwiseTokenSyncResult
} from '../../../../shared/platform/readwiseTokenConnectorRuntimeRepository';

const EMPTY_CONNECTION: RuntimeReadwiseTokenConnection = {
  checked_at: null,
  connected: false,
  message: 'Loading Readwise connection.',
  status: 'not_connected'
};

type PendingAction = 'connect' | 'disconnect' | 'load' | 'sync' | null;

function useInitialReadwiseTokenConnection(
  setConnection: (connection: RuntimeReadwiseTokenConnection) => void,
  setError: (error: string | null) => void,
  setPendingAction: (action: PendingAction) => void
) {
  useEffect(() => {
    let alive = true;
    setPendingAction('load');
    void loadReadwiseTokenConnectionFromRuntime()
      .then((next) => {
        if (alive) setConnection(next);
      })
      .catch(() => {
        if (alive) setError('Could not load Readwise connection.');
      })
      .finally(() => {
        if (alive) setPendingAction(null);
      });
    return () => {
      alive = false;
    };
  }, [setConnection, setError, setPendingAction]);
}

export function useReadwiseTokenConnection() {
  const [connection, setConnection] = useState<RuntimeReadwiseTokenConnection>(EMPTY_CONNECTION);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>('load');
  const [syncResult, setSyncResult] = useState<RuntimeReadwiseTokenSyncResult | null>(null);

  useInitialReadwiseTokenConnection(setConnection, setError, setPendingAction);

  const connect = useCallback(async (token: string) => {
    setPendingAction('connect');
    setError(null);
    setSyncResult(null);
    try {
      const next = await connectReadwiseTokenInRuntime(token);
      setConnection(next);
      return next;
    } catch {
      setError('Could not connect Readwise.');
      return null;
    } finally {
      setPendingAction(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setPendingAction('disconnect');
    setError(null);
    setSyncResult(null);
    try {
      setConnection(await disconnectReadwiseTokenInRuntime());
    } catch {
      setError('Could not disconnect Readwise.');
    } finally {
      setPendingAction(null);
    }
  }, []);

  const sync = useCallback(async () => {
    setPendingAction('sync');
    setError(null);
    setSyncResult(null);
    try {
      const next = await syncReadwiseTokenLibraryInRuntime();
      setSyncResult(next);
      return next;
    } catch {
      setError('Could not sync Readwise.');
      return null;
    } finally {
      setPendingAction(null);
    }
  }, []);

  return { connect, connection, disconnect, error, isPending: pendingAction !== null, pendingAction, sync, syncResult };
}
