import { useEffect, useState } from 'react';

import { compactDatabase, loadDatabaseSpaceStatus } from '../../model/databaseCompaction';

export function useDatabaseCompaction(isAvailable: boolean) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof loadDatabaseSpaceStatus>>>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    let alive = true;
    if (isAvailable) {
      void loadDatabaseSpaceStatus().then((value) => {
        if (alive) setStatus(value);
      });
    }
    return () => { alive = false; };
  }, [isAvailable]);

  const compact = () => {
    setIsCompacting(true);
    setStatusMessage('');
    void compactDatabase().then(async (result) => {
      setStatusMessage(result.ok ? 'success' : result.errorMessage ?? 'failed');
      if (result.ok) setStatus(await loadDatabaseSpaceStatus());
    }).finally(() => setIsCompacting(false));
  };
  return { compact, isCompacting, status, statusMessage };
}
