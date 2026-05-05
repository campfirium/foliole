import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui';

export function CompanionCaptureSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  const options = [
    'Text',
    'Document',
    'Link',
    'File'
  ];

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pb-6 pt-5">
          <div className="mx-auto w-full max-w-[760px]">
            <AppDialogTitle>Add</AppDialogTitle>
            <AppDialogDescription className="mt-2">
              Add is not available on this device yet. Add new material on the desktop and sync again.
            </AppDialogDescription>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {options.map((option) => (
                <button
                  className="rounded-md border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground transition hover:bg-bg-subtle"
                  key={option}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            <AppDialogClose className="mt-5 w-full rounded-md border border-border bg-canvas px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-bg-subtle">
              Close
            </AppDialogClose>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
