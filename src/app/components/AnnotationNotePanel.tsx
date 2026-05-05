import { cn } from '../../shared/lib/utils';
import { AppButton, appFloatingSurfaceClassName } from '../../shared/ui';

export function AnnotationNotePanel(props: {
  draft: string;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  top: number;
}) {
  return (
    <div
      className={cn(appFloatingSurfaceClassName('popover'), 'fixed z-50 w-60 rounded-md p-2')}
      data-annotation-toolbar="true"
      style={{ left: props.left, top: props.top }}
    >
      <textarea
        autoFocus
        className="min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-foreground outline-none placeholder:text-foreground/45"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="Add a note..."
        value={props.draft}
      />
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">Cancel</AppButton>
        <AppButton disabled={!props.draft.trim()} onClick={props.onSave} size="sm">Save</AppButton>
      </div>
    </div>
  );
}
