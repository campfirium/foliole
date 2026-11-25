import { RotateCwSquare } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../../../shared/ui';

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

export function clampSimplePdfPage(value: number, totalPages: number) {
  return Math.max(1, Math.min(Math.max(1, totalPages), Math.trunc(value)));
}

// Typing a page number and confirming scrolls the original straight to that page.
function SimplePdfPageInput(props: { currentPage: number; onJumpToPage(page: number): void; totalPages: number }) {
  const t = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (event?: FormEvent) => {
    event?.preventDefault();
    const digits = draft?.replace(/\D/g, '') ?? '';
    setDraft(null);
    if (!digits) return;
    props.onJumpToPage(clampSimplePdfPage(Number(digits), props.totalPages));
    if (event) (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <form className="flex items-center gap-1 text-xs text-companion-text-secondary" onSubmit={commit}>
      <AppInput
        aria-label={t('desktop.pdf.page.input')}
        className="h-8 w-11 px-1 text-center text-sm"
        enterKeyHint="go"
        inputMode="numeric"
        onBlur={() => { if (draft !== null) commit(); }}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onFocus={(event) => { setDraft(String(props.currentPage)); event.target.select(); }}
        pattern="[0-9]*"
        type="text"
        value={draft ?? String(props.currentPage)}
      />
      <span className="whitespace-nowrap" data-testid="simple-pdf-page-count">/ {props.totalPages}</span>
    </form>
  );
}

export function SimplePdfToolbar(props: {
  backLabel?: string;
  currentPage: number;
  onBack?: () => void;
  onJumpToPage(page: number): void;
  onRotate(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  totalPages: number | null;
  zoom: number;
}) {
  const t = useTranslation();
  return (
    <div className="sticky top-0 z-surface flex items-center justify-between gap-1 border-b border-companion-divider bg-companion-surface px-1 py-2">
      {props.onBack ? <AppButton onClick={props.onBack} variant="ghost">{props.backLabel ?? t('desktop.pdf.simple.backToText')}</AppButton> : <span aria-hidden="true" className="w-14" />}
      {props.totalPages
        ? <SimplePdfPageInput currentPage={props.currentPage} onJumpToPage={props.onJumpToPage} totalPages={props.totalPages} />
        : <span className="text-xs text-companion-text-secondary">-</span>}
      <div className="flex items-center gap-0.5">
        <AppButton aria-label={t('desktop.pdf.zoom.rotateClockwise')} className="px-2" onClick={props.onRotate} title={t('desktop.pdf.zoom.rotateClockwise')} variant="ghost">
          <RotateCwSquare aria-hidden="true" size={16} strokeWidth={2.1} />
        </AppButton>
        <AppButton onClick={props.onZoomOut} variant="ghost">-</AppButton>
        <span className="w-10 text-center text-xs text-companion-text-secondary">{props.zoom}%</span>
        <AppButton onClick={props.onZoomIn} variant="ghost">+</AppButton>
      </div>
    </div>
  );
}
