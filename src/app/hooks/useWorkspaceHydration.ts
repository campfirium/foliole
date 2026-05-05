import { useEffect, useState } from 'react';

import { useWorkspaceStore } from '../../store/workspaceStore';

export function useWorkspaceHydration() {
  const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState(() =>
    useWorkspaceStore.persist.hasHydrated()
  );

  useEffect(() => {
    const unsubHydrate = useWorkspaceStore.persist.onHydrate(() => {
      setIsWorkspaceHydrated(false);
    });
    const unsubFinish = useWorkspaceStore.persist.onFinishHydration(() => {
      setIsWorkspaceHydrated(true);
    });
    setIsWorkspaceHydrated(useWorkspaceStore.persist.hasHydrated());

    return () => {
      unsubHydrate();
      unsubFinish();
    };
  }, []);

  return isWorkspaceHydrated;
}
