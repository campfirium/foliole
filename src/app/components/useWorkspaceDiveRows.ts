import { useEffect, useMemo, useState } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { getDiveRepository, subscribeToDiveChanges } from '../../shared/platform/desktop/diveRepository';

export function useWorkspaceDiveRows() {
  const [dives, setDives] = useState<Dive[]>([]);
  useEffect(() => {
    const repository = getDiveRepository();
    if (!repository) return;
    let active = true;
    const changes = new Map<string, Dive>();
    const unsubscribe = subscribeToDiveChanges((dive) => {
      changes.set(dive.id, dive);
      setDives((current) => [...current.filter((entry) => entry.id !== dive.id), dive]);
    });
    void repository.list().then((result) => {
      if (!active) return;
      for (const dive of result) if (!changes.has(dive.id)) changes.set(dive.id, dive);
      setDives([...changes.values()]);
    }).catch(() => {
      if (active) setDives([...changes.values()]);
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  return useMemo(() => [...dives].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)), [dives]);
}


export function useWorkspaceDiveNavigation(props: {
  isVirtualViewOpen: boolean;
  isTrashViewOpen: boolean;
  isExternalViewOpen: boolean;
  onOpenNotesView: () => void;
}) {
  const dives = useWorkspaceDiveRows();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isOtherView = props.isVirtualViewOpen || props.isTrashViewOpen || props.isExternalViewOpen;
  useEffect(() => {
    if (isOtherView) setSelectedId(null);
  }, [isOtherView]);
  const activeDive = isOtherView ? undefined : dives.find((dive) => dive.id === selectedId);
  return {
    activeDive,
    closeDive: () => setSelectedId(null),
    navigation: {
      dives,
      activeDiveId: activeDive?.id ?? null,
      onSelectDive: (id: string) => {
        if (isOtherView) props.onOpenNotesView();
        setSelectedId(id);
      }
    }
  };
}
