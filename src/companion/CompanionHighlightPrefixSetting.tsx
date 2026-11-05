import { MessageSquare, RotateCcw } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX, getHighlightAnnotationPrefix,
  HIGHLIGHT_ANNOTATION_PREFIX_MAX_LENGTH, setHighlightAnnotationPrefix } from '../shared/config/highlightAnnotationPrefixSetting';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppDialog, AppDialogActions, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppIconButton, AppInput } from '../shared/ui';

import { CompanionListRow } from './CompanionListSurface';

export function CompanionHighlightPrefixSetting() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return <AppDialog open={open} onOpenChange={setOpen}>
    <CompanionListRow Icon={MessageSquare} ariaLabel={t('settings.search.editorHighlightPrefix.title')}
      title={t('settings.search.editorHighlightPrefix.title')} onClick={() => setOpen(true)} />
    {open ? <HighlightPrefixDialog onClose={() => setOpen(false)} /> : null}
  </AppDialog>;
}

function HighlightPrefixDialog(props: { onClose(): void }) {
  const t = useTranslation();
  const [draft, setDraft] = useState(() => {
    try { return getHighlightAnnotationPrefix(); } catch { return null; }
  });
  const [failed, setFailed] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null) return;
    try { setHighlightAnnotationPrefix(draft); props.onClose(); }
    catch { setFailed(true); }
  }
  return <AppDialogPortal>
    <AppDialogOverlay />
    <AppDialogContent className="max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-5">
      <AppDialogTitle className="text-base">{t('settings.search.editorHighlightPrefix.title')}</AppDialogTitle>
      <AppDialogDescription className="mt-2 text-sm">{t('settings.search.editorHighlightPrefix.description')}</AppDialogDescription>
      <form className="mt-5" onSubmit={submit}>
        {draft === null ? <p role="alert">{t('companion.settings.highlightPrefix.loadError')}</p> : <div className="flex items-center gap-2"><AppInput autoFocus
          aria-label={t('settings.search.editorHighlightPrefix.title')} className="min-h-11 text-base"
          maxLength={HIGHLIGHT_ANNOTATION_PREFIX_MAX_LENGTH} value={draft}
          onChange={event => { setDraft(event.target.value); setFailed(false); }} />
          <AppIconButton label={t('settings.editor.highlightPrefix.reset')} className="min-h-11 min-w-11"
            icon={<RotateCcw aria-hidden="true" size={18} />} type="button"
            onClick={() => { setDraft(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX); setFailed(false); }} />
        </div>}
        {failed ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.learning.saveError')}</p> : null}
        <AppDialogActions>
          <AppButton className="min-h-11" type="button" onClick={props.onClose}>{t('common.cancel')}</AppButton>
          {draft === null ? <AppButton className="min-h-11" type="button" onClick={() => {
            try { setDraft(getHighlightAnnotationPrefix()); } catch { /* Keep the unreadable state for retry. */ }
          }}>{t('desktop.reviewCalendar.retry')}</AppButton> : <>
            <AppButton className="min-h-11" type="submit" variant="emphasis">
              {t(failed ? 'desktop.reviewCalendar.retry' : 'shared.confirm.confirm')}
            </AppButton>
          </>}
        </AppDialogActions>
      </form>
    </AppDialogContent>
  </AppDialogPortal>;
}
