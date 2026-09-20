import { useEffect, useRef, useState } from 'react';

import {
  createMobileNodeLinkNavigation, type MobileNodeLinkContext, type MobileNodeLinkResult
} from '../shared/platform/companion/navigation/mobileNodeLink';
import { subscribeMobileNodeLinks } from '../shared/platform/companion/navigation/mobileNodeLinkRuntime';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';

export function useCompanionNodeLink(args: MobileNodeLinkContext & { open(nodeId: string): void }) {
  const current = useRef(args);
  current.current = args;
  const navigation = useRef<ReturnType<typeof createMobileNodeLinkNavigation> | null>(null);
  const [result, setResult] = useState<MobileNodeLinkResult | null>(null);
  useEffect(() => {
    const session = createMobileNodeLinkNavigation({
      getContext: () => current.current,
      loadGroup: loadCompanionSyncGroup,
      open: (nodeId) => current.current.open(nodeId),
      report: setResult
    });
    navigation.current = session;
    const unsubscribe = subscribeMobileNodeLinks(session.receive, () => setResult('unavailable'));
    return () => { session.stop(); unsubscribe(); navigation.current = null; };
  }, []);
  useEffect(() => { void navigation.current?.flush(); }, [args.ready, args.snapshot]);
  return { result, dismiss: () => setResult(null) };
}
