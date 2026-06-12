import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, appFloatingSurfaceClassName, appInputFocusVisibleClassName } from '../../shared/ui';

export function AnnotationNotePanel(props: {
  draft: string;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  top: number;
}) {
  const t = useTranslation();
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
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('desktop.annotation.cancel')}</AppButton>
        <AppButton disabled={!props.draft.trim()} onClick={props.onSave} size="sm">{t('desktop.annotation.save')}</AppButton>
      </div>
    </div>
  );
}
