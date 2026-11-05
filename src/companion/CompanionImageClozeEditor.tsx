import { Minus, Plus, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { AppButton } from '../shared/ui';
import { AppDialog, AppDialogContent, AppDialogDescription, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';

import { COMPANION_ANDROID_BACK_EVENT } from './companionAndroidBackEvent';
import { CompanionImageClozeCanvas } from './CompanionImageClozeCanvas';
import { centeredImageClozeRect, initialImageClozeView, zoomImageClozeView } from './companionImageClozeGeometry';

export function CompanionImageClozeEditor(props: {
  attachmentId: string; src: string; onCancel(): void;
  onConfirm(regions: ImageClozeDraftRegion[]): Promise<void>;
}) {
  const t = useTranslation();
  const canvas = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const busy = useRef(false);
  const [view, setView] = useState(initialImageClozeView);
  const [regions, setRegions] = useState<ImageClozeDraftRegion[]>([]);
  const [marking, setMarking] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); if (!busy.current) props.onCancel(); };
    document.addEventListener(COMPANION_ANDROID_BACK_EVENT, back, true);
    return () => { document.removeEventListener(COMPANION_ANDROID_BACK_EVENT, back, true); };
  }, [props.onCancel]);
  function addRegion() {
    const bounds = image.current?.getBoundingClientRect();
    const viewport = canvas.current?.getBoundingClientRect();
    if (!bounds?.width || !viewport) return;
    const rect = centeredImageClozeRect(bounds, viewport);
    setRegions(current => [...current, { id: `region-${createCompanionUuid()}`, attachmentId: props.attachmentId, answer: '', ...rect }]);
    setMarking(true);
  }
  async function confirm() {
    if (busy.current || !regions.length || status !== 'ready') return;
    busy.current = true; setSaving(true); setError(false);
    try { await props.onConfirm(regions); }
    catch { setError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  return <AppDialog open onOpenChange={open => { if (!open && !busy.current) props.onCancel(); }}>
    <AppDialogPortal>
      <AppDialogContent aria-describedby="image-cloze-instructions" className="flex flex-col !rounded-none !border-0 !bg-canvas"
        style={{ inset: 0, left: 0, top: 0, transform: 'none', translate: 'none', boxShadow: 'none', width: '100%', height: '100%', maxWidth: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 px-3 [&_button]:min-h-11">
          <AppButton disabled={saving} onClick={props.onCancel}>{t('common.cancel')}</AppButton>
          <AppDialogTitle>{t('companion.imageCloze.title')}</AppDialogTitle>
          <AppButton disabled={saving || status !== 'ready' || !regions.length} onClick={() => void confirm()} variant="emphasis">{t(saving ? 'companion.imageCloze.saving' : 'companion.imageCloze.confirm')}</AppButton>
        </header>
        <AppDialogDescription id="image-cloze-instructions" className="px-4 pb-3 text-sm">{t(marking ? 'companion.imageCloze.markHelp' : 'companion.imageCloze.positionHelp')}</AppDialogDescription>
        <CompanionImageClozeCanvas canvas={canvas} image={image} src={props.src} view={view} regions={regions} marking={marking}
          locked={saving || status !== 'ready'} setView={setView} onStatus={setStatus}
          updateRegion={region => setRegions(current => current.map(value => value.id === region.id ? region : value))} />
        {status === 'missing' ? <p role="alert" className="px-4 text-sm text-error">{t('companion.imageCloze.missing')}</p> : null}
        {error ? <p role="alert" className="px-4 text-sm text-error">{t('companion.imageCloze.failed')}</p> : null}
        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-3 [&_button]:min-h-11">
          <AppButton disabled={saving || status !== 'ready'} onClick={() => setView(zoomImageClozeView(view, view.scale / 1.25))} aria-label={t('companion.imageCloze.zoomOut')}><Minus aria-hidden="true" className="size-4" /></AppButton>
          <AppButton disabled={saving || status !== 'ready'} onClick={() => setView(zoomImageClozeView(view, view.scale * 1.25))} aria-label={t('companion.imageCloze.zoomIn')}><Plus aria-hidden="true" className="size-4" /></AppButton>
          <AppButton disabled={saving || !regions.length} onClick={() => setMarking(current => !current)}>{t(marking ? 'companion.imageCloze.position' : 'companion.imageCloze.adjust')}</AppButton>
          <AppButton disabled={saving || status !== 'ready'} onClick={addRegion}>{t('companion.imageCloze.add')}</AppButton>
          <AppButton disabled={saving || !regions.length} onClick={() => setRegions(current => current.slice(0, -1))} aria-label={t('companion.imageCloze.remove')}><Trash2 aria-hidden="true" className="size-4" /></AppButton>
        </footer>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
