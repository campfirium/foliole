import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppInput, AppTextarea } from '../shared/ui';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui/Dialog';

import type { CompanionCustomCssSnippet } from './companionCustomCssModel';

interface EditorDialogProps {
  draft: CompanionCustomCssSnippet | null;
  error: string | null;
  isExisting: boolean;
  isSaving: boolean;
  onCancel(): void;
  onChange(draft: CompanionCustomCssSnippet): void;
  onDelete(): void;
  onSave(): void;
}

function CustomCssEditorFields(props: Pick<EditorDialogProps, 'draft' | 'error' | 'onChange'>) {
  const t = useTranslation();
  if (!props.draft) return null;
  const draft = props.draft;
  return (
    <>
      <label className="block text-sm font-medium text-foreground">
        <span>{t('companion.settings.appearance.css.name')}</span>
        <AppInput autoFocus className="mt-2" onChange={(event) => props.onChange({ ...draft, name: event.currentTarget.value })} value={draft.name} />
      </label>
      <label className="block text-sm font-medium text-foreground">
        <span>{t('companion.settings.appearance.css.source')}</span>
        <AppTextarea className="mt-2 min-h-48 font-mono text-sm" onChange={(event) => props.onChange({ ...draft, sourceCss: event.currentTarget.value })} spellCheck={false} value={draft.sourceCss} />
      </label>
      {props.error ? <p className="text-sm leading-6 text-error" role="alert">{props.error}</p> : null}
      <div className="flex items-center justify-between gap-4 border-t border-companion-divider pt-4">
        <span className="text-sm text-foreground">{t('companion.settings.appearance.css.enabled')}</span>
        <AppButton aria-checked={draft.enabled} onClick={() => props.onChange({ ...draft, enabled: !draft.enabled })} role="switch" type="button">
          {t(draft.enabled ? 'companion.settings.appearance.css.on' : 'companion.settings.appearance.css.off')}
        </AppButton>
      </div>
    </>
  );
}

function CustomCssEditorActions(props: Pick<EditorDialogProps, 'isExisting' | 'isSaving' | 'onCancel' | 'onDelete'>) {
  const t = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {props.isExisting ? (
        <AppButton disabled={props.isSaving} onClick={props.onDelete} type="button" variant="danger">
          {t('companion.settings.appearance.css.delete')}
        </AppButton>
      ) : <span />}
      <div className="flex items-center gap-2">
        <AppButton disabled={props.isSaving} onClick={props.onCancel} type="button">{t('common.cancel')}</AppButton>
        <AppButton loading={props.isSaving} loadingLabel={t('companion.settings.appearance.css.saving')} type="submit" variant="emphasis">
          {t('companion.settings.appearance.css.save')}
        </AppButton>
      </div>
    </div>
  );
}

export function CompanionCustomCssEditorDialog(props: EditorDialogProps) {
  const t = useTranslation();
  return (
    <AppDialog open={Boolean(props.draft)} onOpenChange={(open) => !open && props.onCancel()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto p-5">
          <AppDialogTitle>{t(props.isExisting ? 'companion.settings.appearance.css.editor.editTitle' : 'companion.settings.appearance.css.editor.addTitle')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">{t('companion.settings.appearance.css.editor.description')}</AppDialogDescription>
          <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); props.onSave(); }}>
            <CustomCssEditorFields draft={props.draft} error={props.error} onChange={props.onChange} />
            <CustomCssEditorActions {...props} />
          </form>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
