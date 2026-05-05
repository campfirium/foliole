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
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pb-6 pt-5">
          <div className="mx-auto w-full max-w-[760px]">
            <AppDialogTitle>Capture</AppDialogTitle>
            <AppDialogDescription className="mt-2">
              Capture is not available on this device yet. Add new material on the desktop and sync again.
            </AppDialogDescription>
            <AppDialogClose className="mt-5 w-full rounded-md border border-border bg-canvas px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-bg-subtle">
              Close
            </AppDialogClose>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
