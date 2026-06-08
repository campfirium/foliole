import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

export function KeepImportDisableDialog(props: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceLabel: string;
}) {
  const t = useTranslation();
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
              <AppDialogTitle className="text-base font-semibold">{t('desktop.keepImport.disable.title')}</AppDialogTitle>
              <p className="mt-1 text-sm text-foreground/62">{props.sourceLabel}</p>
            </header>
            <div className="px-6 py-5">
              <p className="text-sm text-foreground/70">
                {t('desktop.keepImport.disable.description')}
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
              <AppButton onClick={() => props.onOpenChange(false)} variant="ghost">
                {t('desktop.keepImport.disable.cancel')}
              </AppButton>
              <AppButton onClick={props.onConfirm} variant="danger">
                {t('desktop.keepImport.disable.turnOff')}
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
