import { useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';

export type CompanionBootstrapStatus =
  | { status: 'booting' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; state: NativeCompanionBootstrapState };

const INITIAL_STATUS: CompanionBootstrapStatus = { status: 'booting' };

export function useCompanionBootstrap() {
  const [bootstrap, setBootstrap] = useState<CompanionBootstrapStatus>(INITIAL_STATUS);

  useEffect(() => {
    let disposed = false;

    void loadCompanionBootstrapState()
      .then((state) => {
        if (disposed) {
          return;
        }
        setBootstrap({ status: 'ready', state });
      })
      .catch((error) => {
        if (disposed) {
          return;
        }
        const message = error instanceof Error && error.message.trim() ? error.message : 'Companion runtime bootstrap failed.';
        setBootstrap({ status: 'failed', message });
      });

    return () => {
      disposed = true;
    };
  }, []);

  return bootstrap;
}
