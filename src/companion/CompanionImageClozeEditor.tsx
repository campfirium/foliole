import { Check, RectangleEllipsis, Trash2, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import type { ImageFocusRect } from '../features/editor/model/markdownImageFocus';
import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import type { ImageClozeEditorPresentation } from '../features/image-cloze/model/imageClozePresentation';
import type { ImageClozeRegionEdit } from '../features/image-cloze/model/imageClozeRegionEdit';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionImageRectKind } from '../shared/platform/companion/editing/companionImageRect';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { AppButton } from '../shared/ui';
import { AppDialog, AppDialogContent, AppDialogDescription, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';

import { COMPANION_ANDROID_BACK_EVENT } from './companionAndroidBackEvent';
import { CompanionImageClozeCanvas } from './CompanionImageClozeCanvas';
import { initialImageClozeView } from './companionImageClozeGeometry';
import { CompanionImageModeSwitch, CompanionImageRectFooter, IMAGE_RECT_TEXT, imageRectCanvasProps } from './CompanionImageRectControls';
import { useCompanionImageClozeSession } from './useCompanionImageClozeSession';
import { useCompanionImageRectSession, type CompanionImageEditMode, type CompanionImageRects } from './useCompanionImageRectSession';

export function CompanionImageClozeEditor(props: {
  attachmentId: string; src: string; onCancel(): void;
  savedRegions?: ImageClozeEditorPresentation['regions'];
  onDelete?(regionId: string): Promise<void>;
  onConfirm(regions: ImageClozeDraftRegion[], edits?: ImageClozeRegionEdit[]): Promise<void>;
  rects?: CompanionImageRects;
  onSaveRect?(kind: CompanionImageRectKind, rect: ImageFocusRect | null): Promise<void>;
}) {
  const t = useTranslation();
  const canvas = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [view, setView] = useState(initialImageClozeView);
  const [drawing, setDrawing] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [mode, setMode] = useState<CompanionImageEditMode>('cloze');
  const cloze = useCompanionImageClozeSession(props, status === 'ready');
  const rect = useCompanionImageRectSession(props);
  const { savedRegions, hasChanges, updateRegion, regions, setRegions, selected, setSelected, deleteError, confirm: saveChanges, removeSelected } = cloze;
  const saving = cloze.saving || rect.saving, kind = mode === 'cloze' ? null : mode;
  const busy = { get current() { return cloze.busy.current || rect.busy.current; } };
  useLayoutEffect(() => {
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); if (!busy.current) props.onCancel(); };
    document.addEventListener(COMPANION_ANDROID_BACK_EVENT, back, true);
    return () => { document.removeEventListener(COMPANION_ANDROID_BACK_EVENT, back, true); };
  }, [props.onCancel]);
  return <AppDialog open onOpenChange={open => { if (!open && !busy.current) props.onCancel(); }}>
    <AppDialogPortal>
      <AppDialogContent aria-describedby="image-cloze-instructions" className="flex flex-col !rounded-none !border-0 !bg-canvas"
        style={{ inset: 0, left: 0, top: 0, transform: 'none', translate: 'none', boxShadow: 'none', width: '100%', height: '100%', maxWidth: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <header className="flex min-h-14 shrink-0 items-center justify-center gap-2 px-3 [&_button]:min-h-11">
          <AppDialogTitle className={props.onSaveRect ? 'sr-only' : undefined}>{t(kind ? IMAGE_RECT_TEXT[kind].title : 'companion.imageCloze.title')}</AppDialogTitle>
          {props.onSaveRect ? <CompanionImageModeSwitch mode={mode} disabled={saving} locked={kind ? rect.changed(kind) : hasChanges} onChange={value => { setMode(value); setDrawing(false); setSelected(null); }} /> : null}
        </header>
        <AppDialogDescription id="image-cloze-instructions" className="px-4 pb-3 text-sm">{t(kind ? IMAGE_RECT_TEXT[kind].help : drawing ? 'companion.imageCloze.drawHelp' : 'companion.imageCloze.markHelp')}</AppDialogDescription>
        <CompanionImageClozeCanvas canvas={canvas} image={image} src={props.src} view={view} marking locked={saving || status !== 'ready'} setView={setView} onStatus={setStatus}
          {...(kind ? imageRectCanvasProps(kind, rect, props.attachmentId, t(IMAGE_RECT_TEXT[kind].region)) : {
            regions, savedRegions, drawing, finishDrawing: () => setDrawing(false), selected, select: (id: string | null) => { setSelected(id); if (id) setDrawing(false); },
            newRegion: () => ({ id: `region-${createCompanionUuid()}`, attachmentId: props.attachmentId, answer: '', x: 0, y: 0, width: 0, height: 0 }),
            drawRegion: (region: ImageClozeDraftRegion) => { setRegions(current => [...current.filter(value => value.id !== region.id), region]); setSelected(region.id); },
            removeRegion: (id: string) => { setRegions(current => current.filter(value => value.id !== id)); setSelected(current => current === id ? null : current); },
            updateRegion
          })} />
        {status === 'missing' ? <p role="alert" className="px-4 text-sm text-error">{t('companion.imageCloze.missing')}</p> : null}
        {deleteError ? <p role="alert" className="px-4 text-sm text-error">{t('companion.imageCloze.deleteFailed')}</p> : null}
        {cloze.error && !kind ? <p role="alert" className="px-4 text-sm text-error">{t('companion.imageCloze.failed')}</p> : null}
        {rect.error && kind ? <p role="alert" className="px-4 text-sm text-error">{t('companion.imageCloze.rectFailed')}</p> : null}
        {kind ? <CompanionImageRectFooter kind={kind} session={rect} saving={saving} ready={status === 'ready'} onCancel={props.onCancel} /> : <footer className="flex shrink-0 items-center justify-center gap-4 px-3 py-3 [&_button]:min-h-11 [&_button]:min-w-11">
          <AppButton disabled={saving} onClick={props.onCancel} aria-label={t('common.cancel')} title={t('common.cancel')}><X aria-hidden="true" className="size-5" /></AppButton>
          <AppButton disabled={saving || status !== 'ready'} variant={drawing ? 'emphasis' : 'default'} aria-pressed={drawing} aria-label={t('companion.imageCloze.add')} title={t('companion.imageCloze.add')} onClick={() => { setDrawing(current => !current); setSelected(null); }}><RectangleEllipsis aria-hidden="true" className="size-5" /></AppButton>
          <AppButton disabled={saving || !selected} onClick={() => void removeSelected()} aria-label={t('companion.imageCloze.remove')} title={t('companion.imageCloze.remove')}><Trash2 aria-hidden="true" className="size-5" /></AppButton>
          <AppButton disabled={saving || status !== 'ready'} onClick={() => { if (hasChanges) void saveChanges(); else props.onCancel(); }} variant="emphasis" aria-label={t(saving ? 'companion.imageCloze.saving' : 'companion.imageCloze.confirm')} title={t('companion.imageCloze.confirm')}><Check aria-hidden="true" className="size-5" /></AppButton>
        </footer>}
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
