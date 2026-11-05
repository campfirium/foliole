import { useRef, type PointerEvent, type MouseEvent } from 'react';

import { changeImageClozeRect, zoomImageClozeView, type ImageClozeView } from './companionImageClozeGeometry';

import type { ImageClozeDraftRegion } from '@/features/image-cloze/model/imageCloze';

type Point = { x: number; y: number };
type Drag = { point: Point; view: ImageClozeView; region?: ImageClozeDraftRegion | undefined; handle: string; distance: number;
  size: DOMRect; targetId?: string | undefined; kind: 'draw' | 'region' | 'saved' | 'view'; draft?: ImageClozeDraftRegion | undefined };
const center = (points: Point[]) => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
const distance = (points: Point[]) => points.length < 2 ? 0 : Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
const suppressMovedClick = (event: MouseEvent<HTMLDivElement>, moved: boolean) => { if (moved) { event.preventDefault(); event.stopPropagation(); } };
const ratio = (value: number) => Math.max(0, Math.min(1, value));

export function useCompanionImageClozeGestures(args: {
  locked: boolean; drawing: boolean; selected: string | null; finishDrawing(): void; view: ImageClozeView; regions: ImageClozeDraftRegion[];
  newRegion(): ImageClozeDraftRegion; select(id: string | null): void;
  drawRegion(region: ImageClozeDraftRegion): void; removeRegion(id: string): void;
  setView(view: ImageClozeView): void; updateRegion(region: ImageClozeDraftRegion): void;
}) {
  const latest = useRef(args); latest.current = args;
  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (latest.current.locked || event.button > 0) return;
    event.preventDefault();
    if (!pointers.current.size) moved.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = (event.target as Element).closest<HTMLElement>('[data-cloze-region]');
    const points = [...pointers.current.values()];
    if (points.length > 1) moved.current = true;
    const size = event.currentTarget.querySelector('[data-cloze-image]')!.getBoundingClientRect();
    if (points.length > 1 && drag.current?.draft) latest.current.removeRegion(drag.current.draft.id);
    const region = latest.current.selected === target?.dataset.clozeRegion ? latest.current.regions.find(value => value.id === target?.dataset.clozeRegion) : undefined;
    const inside = event.clientX >= size.left && event.clientX <= size.right && event.clientY >= size.top && event.clientY <= size.bottom;
    drag.current = { point: center(points), distance: distance(points), view: latest.current.view, size,
      handle: target?.dataset.clozeHandle ?? 'move', region, targetId: target?.dataset.clozeRegion,
      kind: points.length > 1 ? 'view' : region ? 'region' : latest.current.drawing && inside && !target ? 'draw' : 'view',
      ...(!target && inside && latest.current.drawing && points.length === 1 ? { draft: latest.current.newRegion() } : {}) };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (latest.current.locked || !start || !pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const point = center(points);
    if (points.length > 1 || Math.hypot(point.x - start.point.x, point.y - start.point.y) >= 6) moved.current = true;
    if (!moved.current) return;
    if (points.length > 1 || start.kind === 'view') {
      moveView(start, points, event.currentTarget.getBoundingClientRect(), latest.current.setView);
    } else if (start.kind === 'region' && start.region) {
      latest.current.updateRegion({ ...start.region, ...changeImageClozeRect(start.region, start.handle,
        (point.x - start.point.x) / start.size.width, (point.y - start.point.y) / start.size.height) });
    } else if (start.kind === 'draw' && start.draft && Math.hypot(point.x - start.point.x, point.y - start.point.y) >= 4) {
      latest.current.drawRegion(drawnRegion(start, point));
    }
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (event.type === 'pointercancel' && current?.region) latest.current.updateRegion(current.region);
    if (!moved.current && event.type !== 'pointercancel') latest.current.select(current?.targetId ?? null);
    if (current?.kind === 'draw' && latest.current.regions.some(region => region.id === current.draft?.id && region.width > 0 && region.height > 0) && event.type !== 'pointercancel') latest.current.finishDrawing();
    if (current?.draft && (event.type === 'pointercancel' || !latest.current.regions.some(region => region.id === current.draft!.id && region.width > 0 && region.height > 0))) latest.current.removeRegion(current.draft.id);
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const point = [...pointers.current.values()][0];
    drag.current = point && current ? { ...current, point, view: latest.current.view, distance: 0, region: undefined, draft: undefined,
      kind: 'view', size: event.currentTarget.querySelector('[data-cloze-image]')!.getBoundingClientRect() } : null;
  }
  return { onPointerDown: begin, onPointerMove: move, onPointerUp: end, onPointerCancel: end, onClickCapture: (event: MouseEvent<HTMLDivElement>) => suppressMovedClick(event, moved.current) };
}

function moveView(start: Drag, points: Point[], bounds: DOMRect, setView: (view: ImageClozeView) => void) {
  const point = center(points);
  const zoom = zoomImageClozeView(start.view, start.distance ? start.view.scale * distance(points) / start.distance : start.view.scale,
    { x: start.point.x - bounds.left - bounds.width / 2, y: start.point.y - bounds.top - bounds.height / 2 });
  const maxX = Math.max(0, (start.size.width / start.view.scale * zoom.scale - bounds.width) / 2);
  const maxY = Math.max(0, (start.size.height / start.view.scale * zoom.scale - bounds.height) / 2);
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  setView({ ...zoom, x: clamp(zoom.x + point.x - start.point.x, maxX), y: clamp(zoom.y + point.y - start.point.y, maxY) });
}

function drawnRegion(start: Drag, point: Point): ImageClozeDraftRegion {
  const x = ratio((start.point.x - start.size.left) / start.size.width);
  const y = ratio((start.point.y - start.size.top) / start.size.height);
  const endX = ratio((point.x - start.size.left) / start.size.width);
  const endY = ratio((point.y - start.size.top) / start.size.height);
  return { ...start.draft!, x: Math.min(x, endX), y: Math.min(y, endY), width: Math.abs(x - endX), height: Math.abs(y - endY) };
}
