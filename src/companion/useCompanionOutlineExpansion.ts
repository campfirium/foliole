import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';

import type { DocumentOutlineNavigation } from '../features/editor/model/documentOutlineNavigation';

export function useCompanionOutlineExpansion(model: DocumentOutlineNavigation,
  scrollRef: RefObject<HTMLElement | null>) {
  const defaults = useMemo(() => new Set(Object.values(model.entries)
    .filter(entry => entry.kind === 'folder').map(entry => entry.id)), [model]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(defaults);
  const manual = useRef(false);
  const probing = useRef(false);
  const measured = useRef<{ model: DocumentOutlineNavigation; width: number; height: number } | null>(null);
  const [, remeasure] = useReducer(value => value + 1, 0);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (manual.current || !viewport || viewport.clientHeight <= 0) return;
    if (probing.current) {
      probing.current = false;
      if (viewport.scrollHeight > viewport.clientHeight) setExpanded(defaults);
      return;
    }
    const { clientWidth: width, clientHeight: height } = viewport;
    const previous = measured.current;
    if (previous?.model === model && previous.width === width && previous.height === height) return;
    measured.current = { model, width, height };
    const rowCount = Object.keys(model.entries).length + model.sections.filter(section => section.text).length;
    // Every row is at least one touch target; avoid mounting a large tree just to measure overflow.
    if (rowCount * 44 > height) { setExpanded(defaults); return; }
    probing.current = true;
    setExpanded(new Set(Object.values(model.entries).filter(entry => entry.childIds.length).map(entry => entry.id)));
  });

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    remeasure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [scrollRef]);

  function markManual() { manual.current = true; probing.current = false; }
  function toggle(id: string) {
    markManual();
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return { expanded, markManual, toggle };
}
