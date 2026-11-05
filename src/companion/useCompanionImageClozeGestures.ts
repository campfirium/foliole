import { useRef, type PointerEvent } from 'react';

import { changeImageClozeRect, zoomImageClozeView, type ImageClozeView } from './companionImageClozeGeometry';

import type { ImageClozeDraftRegion } from '@/features/image-cloze/model/imageCloze';

type Point = { x: number; y: number };
type Drag = { point: Point; view: ImageClozeView; region?: ImageClozeDraftRegion | undefined; handle: string; distance: number; size: { width: number; height: number } };
const center = (points: Point[]) => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
const distance = (points: Point[]) => points.length < 2 ? 0 : Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);

export function useCompanionImageClozeGestures(args: {
  locked: boolean; marking: boolean; view: ImageClozeView; regions: ImageClozeDraftRegion[];
  setView(view: ImageClozeView): void;
  updateRegion(region: ImageClozeDraftRegion): void;
}) {
  const latest = useRef(args); latest.current = args;
  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<Drag | null>(null);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (latest.current.locked || event.button > 0) return;
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = (event.target as Element).closest<HTMLElement>('[data-cloze-region]');
    const points = [...pointers.current.values()];
    drag.current = { point: center(points), distance: distance(points), view: latest.current.view,
      handle: target?.dataset.clozeHandle ?? 'move',
      size: event.currentTarget.querySelector('[data-cloze-image]')!.getBoundingClientRect(),
      ...(target ? { region: latest.current.regions.find(region => region.id === target.dataset.clozeRegion) } : {}) };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (latest.current.locked || !start || !pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const point = center(points);
    if (latest.current.marking) {
      if (start.region && points.length === 1 && start.size.width > 0 && start.size.height > 0) latest.current.updateRegion({
        ...start.region, ...changeImageClozeRect(start.region, start.handle, (point.x - start.point.x) / start.size.width, (point.y - start.point.y) / start.size.height)
      });
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const zoom = zoomImageClozeView(start.view, start.distance ? start.view.scale * distance(points) / start.distance : start.view.scale,
      { x: start.point.x - bounds.left - bounds.width / 2, y: start.point.y - bounds.top - bounds.height / 2 });
    latest.current.setView({ ...zoom, x: zoom.x + point.x - start.point.x, y: zoom.y + point.y - start.point.y });
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    pointers.current.clear();
  }
  return { onPointerDown: begin, onPointerMove: move, onPointerUp: end, onPointerCancel: end };
}
