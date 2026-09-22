import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';

export function useElementWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  useEffect(() => {
    if (!element) return undefined;
    const updateWidth = () => setWidth(element.clientWidth || window.innerWidth);
    updateWidth();
    const frame = window.requestAnimationFrame(updateWidth);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    window.addEventListener('resize', updateWidth);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateWidth);
      observer.disconnect();
    };
  }, [element]);
  return { ref, width };
}

export function SimplePdfToolbar(props: {
  backLabel?: string;
  onBack?: () => void;
  onZoomIn(): void;
  onZoomOut(): void;
  totalPages: number | null;
  zoom: number;
}) {
  const t = useTranslation();
  return (
    <div className="sticky top-0 z-surface flex items-center justify-between gap-2 border-b border-companion-divider bg-companion-surface px-1 py-2">
      {props.onBack ? <AppButton onClick={props.onBack} variant="ghost">{props.backLabel ?? t('desktop.pdf.simple.backToText')}</AppButton> : <span aria-hidden="true" className="w-14" />}
      <span className="text-xs text-companion-text-secondary">
        {props.totalPages ? t(props.totalPages === 1 ? 'desktop.pdf.simple.pageCount.one' : 'desktop.pdf.simple.pageCount.many', { count: props.totalPages }) : '-'}
      </span>
      <div className="flex items-center gap-1">
        <AppButton onClick={props.onZoomOut} variant="ghost">-</AppButton>
        <span className="w-12 text-center text-xs text-companion-text-secondary">{props.zoom}%</span>
        <AppButton onClick={props.onZoomIn} variant="ghost">+</AppButton>
      </div>
    </div>
  );
}
