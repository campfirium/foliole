import { useRef } from 'react';

import { useCompanionNavigationField } from './CompanionNavigationProvider';
import { useCompanionImmersiveScrollPosition } from './useCompanionImmersiveScrollPosition';

export function useCompanionArticleScrollPosition(args: {
  nodeId: string; external: boolean; scrollTop: number; onScrollTopChange?: ((scrollTop: number) => void) | undefined;
}) {
  const [positions, setPositions] = useCompanionNavigationField('externalScrollTopById', {});
  const restored = useRef({ nodeId: args.nodeId, scrollTop: positions[args.nodeId] ?? 0 });
  if (restored.current.nodeId !== args.nodeId) restored.current = { nodeId: args.nodeId, scrollTop: positions[args.nodeId] ?? 0 };
  return useCompanionImmersiveScrollPosition(args.nodeId, args.external ? restored.current.scrollTop : args.scrollTop,
    scrollTop => {
      if (args.external) setPositions(current => ({ ...current, [args.nodeId]: scrollTop }));
      else args.onScrollTopChange?.(scrollTop);
    });
}
