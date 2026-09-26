import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, appFloatingSurfaceClassName, appInputFocusVisibleClassName } from '../../shared/ui';
import { useDismissibleSurface } from '../../shared/ui/useDismissibleSurface';

export function AnnotationNotePanel(props: {
  draft: string;
  error?: string | null;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  top: number;
}) {
  const t = useTranslation();
  useDismissibleSurface({ onDismiss: props.onCancel });

  return (
    <div
      className={cn(appFloatingSurfaceClassName('popover'), 'fixed z-floating w-60 p-2')}
      data-annotation-toolbar="true"
      style={{ left: props.left, top: props.top }}
    >
      <textarea
        autoFocus
        className={cn(
          'min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-foreground placeholder:text-foreground/45',
          appInputFocusVisibleClassName
        )}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={t('desktop.annotation.comment.placeholder')}
        value={props.draft}
      />
      {props.error ? <p className="px-1 text-xs text-destructive" role="alert">{props.error}</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('desktop.annotation.cancel')}</AppButton>
        <AppButton disabled={!props.draft.trim() || props.saving} onClick={props.onSave} size="sm">{t('desktop.annotation.save')}</AppButton>
      </div>
    </div>
  );
}
