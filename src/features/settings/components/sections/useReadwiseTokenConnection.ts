import { useCallback, useEffect, useState } from 'react';

import {
  connectReadwiseTokenInRuntime,
  disconnectReadwiseTokenInRuntime,
  loadReadwiseTokenConnectionFromRuntime,
  type RuntimeReadwiseTokenConnection
} from '../../../../shared/platform/readwiseTokenConnectorRuntimeRepository';

const EMPTY_CONNECTION: RuntimeReadwiseTokenConnection = {
  checked_at: null,
  connected: false,
  message: 'Loading Readwise connection.',
  status: 'not_connected'
};

export function useReadwiseTokenConnection() {
  const [connection, setConnection] = useState<RuntimeReadwiseTokenConnection>(EMPTY_CONNECTION);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadReadwiseTokenConnectionFromRuntime()
      .then((next) => {
        if (alive) setConnection(next);
      })
      .catch(() => {
        if (alive) setError('Could not load Readwise connection.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const connect = useCallback(async (token: string) => {
    setIsPending(true);
    setError(null);
    try {
      const next = await connectReadwiseTokenInRuntime(token);
      setConnection(next);
      return next;
    } catch {
      setError('Could not connect Readwise.');
      return null;
    } finally {
      setIsPending(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      setConnection(await disconnectReadwiseTokenInRuntime());
    } catch {
      setError('Could not disconnect Readwise.');
    } finally {
      setIsPending(false);
    }
  }, []);

  return { connect, connection, disconnect, error, isPending };
}
