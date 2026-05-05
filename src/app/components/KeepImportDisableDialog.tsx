import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

export function KeepImportDisableDialog(props: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceLabel: string;
}) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 w-[min(480px,calc(100vw-64px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section className="flex flex-col">
            <header className="border-b border-border/60 px-6 pb-4 pt-5">
              <AppDialogTitle className="text-base font-semibold">Turn off keep import</AppDialogTitle>
              <p className="mt-1 text-sm text-foreground/62">{props.sourceLabel}</p>
            </header>
            <div className="px-6 py-5">
              <p className="text-sm text-foreground/70">
                This will stop automatic updates for this source. You can preview it again and turn it back on later.
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
              <AppButton onClick={() => props.onOpenChange(false)} variant="ghost">
                Cancel
              </AppButton>
              <AppButton onClick={props.onConfirm} variant="primary">
                Turn off
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
