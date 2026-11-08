import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

type Point = { x: number; y: number };
type View = Point & { scale: number };
const fitted: View = { x: 0, y: 0, scale: 1 };
const position = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

function moveView(view: View, from: Point, to: Point, factor: number, viewport: DOMRect, image: { width: number; height: number }): View {
  const scale = Math.max(1, Math.min(6, view.scale * factor));
  const ratio = scale / view.scale;
  const x = from.x - viewport.left - viewport.width / 2;
  const y = from.y - viewport.top - viewport.height / 2;
  return {
    scale,
    x: clamp(x + (view.x - x) * ratio + to.x - from.x, Math.max(0, (image.width * scale - viewport.width) / 2)),
    y: clamp(y + (view.y - y) * ratio + to.y - from.y, Math.max(0, (image.height * scale - viewport.height) / 2))
  };
}

function usePreviewPanZoom() {
  const [view, setView] = useState(fitted);
  const current = useRef(fitted);
  const pointers = useRef(new Map<number, Point>());

  const update = useCallback((view: View) => {
    current.current = view;
    setView(view);
  }, []);
  const reset = useCallback(() => update(fitted), [update]);

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, position(event));
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = position(event);
    pointers.current.set(event.pointerId, next);
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    const viewport = event.currentTarget.getBoundingClientRect();
    const image = event.currentTarget.querySelector('img');
    if (!image?.offsetWidth || !image.offsetHeight) return;
    update(moveView(current.current, other ? midpoint(previous, other) : previous,
      other ? midpoint(next, other) : next, other ? distance(next, other) / Math.max(1, distance(previous, other)) : 1,
      viewport, { width: image.offsetWidth, height: image.offsetHeight }));
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  return { view, reset,
    gestures: { onPointerDown: begin, onPointerMove: move, onLostPointerCapture: end, onPointerUp: end, onPointerCancel: end } };
}

export function MarkdownImagePreviewViewport({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const { view, reset, gestures } = usePreviewPanZoom();
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = stage.current!;
    const measure = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      reset();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [reset]);

  return <div ref={stage} className="grid min-h-0 flex-1 touch-none select-none place-items-center overflow-hidden"
    style={{ '--preview-width': `${size.width}px`, '--preview-height': `${size.height}px` } as CSSProperties}
    {...gestures}>
    <div className="flex min-h-0 min-w-0 items-center justify-center"
      style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      {children}
    </div>
  </div>;
}
