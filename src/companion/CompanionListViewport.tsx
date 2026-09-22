import { createContext, useCallback, useContext, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';

import type { VirtualListAnchor, VirtualListPosition } from '../shared/ui/virtualListPosition';
import { VirtualListSurface } from '../shared/ui/VirtualListSurface';

interface ListViewport {
  scrollRef: RefObject<HTMLDivElement | null>;
  positions: Map<string, VirtualListAnchor>;
  sortIdentity: string;
}
const ViewportContext = createContext<ListViewport | null>(null);
const InteractionContext = createContext<(active: boolean) => void>(() => undefined);
export const useCompanionListInteraction = () => useContext(InteractionContext);

export function CompanionListViewportProvider(props: {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  sortIdentity: string;
}) {
  const positions = useRef(new Map<string, VirtualListAnchor>()).current;
  const value = useMemo(() => ({ positions, scrollRef: props.scrollRef, sortIdentity: props.sortIdentity }),
    [positions, props.scrollRef, props.sortIdentity]);
  return <ViewportContext.Provider value={value}>{props.children}</ViewportContext.Provider>;
}

function CompanionListItem(props: { children: ReactNode; itemKey: string; pin: Dispatch<SetStateAction<string | null>> }) {
  const [interacting, setInteracting] = useState(false);
  const { pin, itemKey } = props;
  const interaction = useCallback((active: boolean) => { setInteracting(active); pin((current) => active ? itemKey : current === itemKey ? null : current); }, [pin, itemKey]);
  return <InteractionContext.Provider value={interaction}>
    <div onFocusCapture={() => props.pin(props.itemKey)} onBlurCapture={(event) => {
      if (!interacting && !event.currentTarget.contains(event.relatedTarget as Node | null)) props.pin((current) => current === props.itemKey ? null : current);
    }}>{props.children}</div>
  </InteractionContext.Provider>;
}

export function CompanionListViewport<T>(props: {
  items: readonly T[];
  getItemKey(item: T): string;
  renderItem(item: T): ReactNode;
  estimateSize(index: number): number;
  viewKey: string;
}) {
  const viewport = useContext(ViewportContext);
  const keyRef = useRef(props.getItemKey);
  keyRef.current = props.getItemKey;
  const getItemKey = useCallback((item: T) => keyRef.current(item), []);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const identity = `${viewport?.sortIdentity ?? ''}:${props.viewKey}`;
  const position = useMemo<VirtualListPosition | undefined>(() => viewport ? {
    read: () => viewport.positions.get(identity),
    write: (anchor) => {
      viewport.positions.delete(identity);
      viewport.positions.set(identity, anchor);
      if (viewport.positions.size > 20) viewport.positions.delete(viewport.positions.keys().next().value!);
    }
  } : undefined, [identity, viewport]);
  return <VirtualListSurface
    key={identity}
    accountForOffset autoScroll={false} enabled={Boolean(viewport)} measureItems
    estimateSize={props.estimateSize} getItemKey={getItemKey} items={props.items}
    pinnedItemKey={pinnedKey} scrollElementRef={viewport?.scrollRef ?? fallbackRef}
    {...(position ? { position } : {})}
    renderItem={(item) => <CompanionListItem itemKey={props.getItemKey(item)} pin={setPinnedKey}>
      {props.renderItem(item)}
    </CompanionListItem>}
  />;
}
