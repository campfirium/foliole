import { useLayoutEffect, useState, type RefObject } from 'react';

import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import type { ImageClozeView } from './companionImageClozeGeometry';
import { useCompanionImageClozeGestures } from './useCompanionImageClozeGestures';

function Mask(props: { region: ImageClozeDraftRegion; index: number; scale: number; marking: boolean }) {
  const t = useTranslation();
  const { region, scale } = props;
  return <div data-cloze-region={region.id} data-cloze-handle="move" aria-label={t('companion.imageCloze.region', { number: props.index + 1 })}
    className="absolute border-2 border-cloze bg-cloze/40" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}>
    {props.marking ? ['nw', 'ne', 'sw', 'se'].map(handle => <span key={handle} data-cloze-region={region.id} data-cloze-handle={handle}
      className="absolute flex items-center justify-center" style={{ width: 44 / scale, height: 44 / scale, transform: 'translate(-50%, -50%)', left: handle.includes('w') ? '0%' : '100%', top: handle.includes('n') ? '0%' : '100%' }}>
      <span className="rounded-full border border-cloze bg-canvas" style={{ width: 12 / scale, height: 12 / scale }} />
    </span>) : null}
  </div>;
}

export function CompanionImageClozeCanvas(props: {
  canvas: RefObject<HTMLDivElement | null>; image: RefObject<HTMLImageElement | null>;
  src: string; view: ImageClozeView; regions: ImageClozeDraftRegion[]; marking: boolean; locked: boolean;
  setView(view: ImageClozeView): void; updateRegion(region: ImageClozeDraftRegion): void;
  onStatus(status: 'ready' | 'missing'): void;
}) {
  const t = useTranslation();
  const [size, setSize] = useState({ width: 0, height: 0 });
  function fit() {
    const node = props.image.current;
    const bounds = props.canvas.current?.getBoundingClientRect();
    if (!node?.naturalWidth || !bounds?.width || !bounds.height) return;
    const scale = Math.min(bounds.width / node.naturalWidth, bounds.height / node.naturalHeight);
    setSize({ width: node.naturalWidth * scale, height: node.naturalHeight * scale });
  }
  useLayoutEffect(() => {
    const observer = new ResizeObserver(fit);
    if (props.canvas.current) observer.observe(props.canvas.current);
    return () => observer.disconnect();
  }, [props.canvas, props.image]);
  const gestures = useCompanionImageClozeGestures({ locked: props.locked, marking: props.marking, regions: props.regions,
    view: props.view, setView: props.setView, updateRegion: props.updateRegion });
  return <div ref={props.canvas} className="relative min-h-0 flex-1 touch-none overflow-hidden select-none" data-testid="image-cloze-canvas" {...gestures}>
    <div data-cloze-image className="absolute left-1/2 top-1/2" style={{ ...size, transform: `translate(-50%, -50%) translate(${props.view.x}px, ${props.view.y}px) scale(${props.view.scale})`, transformOrigin: 'center' }}>
      <img ref={props.image} alt={t('companion.imageCloze.source')} src={props.src} draggable={false} className="block h-full w-full"
        onLoad={() => { fit(); props.onStatus('ready'); }} onError={() => props.onStatus('missing')} />
      {props.regions.map((region, index) => <Mask key={region.id} region={region} index={index} scale={props.view.scale} marking={props.marking} />)}
    </div>
  </div>;
}
