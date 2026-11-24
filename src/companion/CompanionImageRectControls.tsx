import { Check, Trash2, X } from 'lucide-react';

import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionImageRectKind } from '../shared/platform/companion/editing/companionImageRect';
import { AppButton } from '../shared/ui';

import type { CompanionImageEditMode, useCompanionImageRectSession } from './useCompanionImageRectSession';

const MODES = [['cloze', 'companion.imageCloze.modeCloze'], ['focus', 'companion.imageCloze.modeFocus'], ['crop', 'companion.imageCloze.modeCrop']] as const;

export const IMAGE_RECT_TEXT = {
  focus: { title: 'companion.imageCloze.focusTitle', help: 'companion.imageCloze.focusHelp', region: 'companion.imageCloze.focusRegion', remove: 'companion.imageCloze.removeFocus' },
  crop: { title: 'companion.imageCloze.cropTitle', help: 'companion.imageCloze.cropHelp', region: 'companion.imageCloze.cropRegion', remove: 'companion.imageCloze.removeCrop' }
} as const;

/** Unsaved work in one mode keeps the other modes closed, so one confirmation never mixes a cloze with a label edit. */
export function CompanionImageModeSwitch(props: { mode: CompanionImageEditMode; disabled: boolean; locked: boolean; onChange(mode: CompanionImageEditMode): void }) {
  const t = useTranslation();
  return <div role="group" aria-label={t('companion.imageCloze.mode')} className="flex gap-1">
    {MODES.map(([value, label]) => <AppButton key={value} variant={props.mode === value ? 'emphasis' : 'default'} aria-pressed={props.mode === value}
      disabled={props.disabled || (props.mode !== value && props.locked)} onClick={() => { if (props.mode !== value) props.onChange(value); }}>{t(label)}</AppButton>)}
  </div>;
}

/** In focus and crop modes the canvas edits one rectangle: draw it when absent, otherwise adjust it with its handles. */
export function imageRectCanvasProps(kind: CompanionImageRectKind, session: ReturnType<typeof useCompanionImageRectSession>, attachmentId: string, label: string) {
  const rect = session.rect(kind);
  return {
    regions: session.region(kind), savedRegions: [], drawing: !rect, finishDrawing: () => {}, selected: rect ? kind : null, select: () => {},
    newRegion: (): ImageClozeDraftRegion => ({ id: kind, attachmentId, answer: '', x: 0, y: 0, width: 0, height: 0 }),
    drawRegion: (region: ImageClozeDraftRegion) => session.update(kind, region), removeRegion: () => session.clear(kind),
    updateRegion: (region: ImageClozeDraftRegion) => session.update(kind, region), rectMode: { kind, label, rect }
  };
}

export function CompanionImageRectFooter(props: {
  kind: CompanionImageRectKind; session: ReturnType<typeof useCompanionImageRectSession>; saving: boolean; ready: boolean; onCancel(): void;
}) {
  const t = useTranslation();
  const { kind, session } = props;
  const remove = t(IMAGE_RECT_TEXT[kind].remove);
  return <footer className="flex shrink-0 items-center justify-center gap-4 px-3 py-3 [&_button]:min-h-11 [&_button]:min-w-11">
    <AppButton disabled={props.saving} onClick={props.onCancel} aria-label={t('common.cancel')} title={t('common.cancel')}><X aria-hidden="true" className="size-5" /></AppButton>
    <AppButton disabled={props.saving || !session.rect(kind)} onClick={() => session.clear(kind)} aria-label={remove} title={remove}><Trash2 aria-hidden="true" className="size-5" /></AppButton>
    <AppButton disabled={props.saving || !props.ready} variant="emphasis" title={t('companion.imageCloze.confirm')}
      aria-label={t(session.saving ? 'companion.imageCloze.savingRect' : 'companion.imageCloze.confirm')}
      onClick={() => { if (session.changed(kind)) void session.save(kind); else props.onCancel(); }}><Check aria-hidden="true" className="size-5" /></AppButton>
  </footer>;
}
