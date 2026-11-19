import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';

import { SuperMemoResult } from './SuperMemoDirectoryUpdate';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

type Result = NonNullable<ReturnType<typeof useSuperMemoDraft>['result']>;

export function SuperMemoImportComplete({ open, result, onClose }: { open: boolean; result: Result; onClose(): void }) {
  const t = useTranslation();
  return <AppDialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <AppDialogPortal>
      <AppDialogOverlay />
      <AppDialogContent layout="notice" className="w-[min(360px,calc(100vw-32px))]" aria-describedby={undefined}>
        <AppDialogTitle>{t(result.directoryUpdate ? 'desktop.superMemoDrafts.updateComplete' : 'desktop.superMemoDrafts.importComplete')}</AppDialogTitle>
        {result.directoryUpdate ? <AppDialogBody><SuperMemoResult result={result} /></AppDialogBody> : null}
        <AppDialogActions>
          <AppDialogClose asChild>
            <AppButton>{t('desktop.superMemoDrafts.close')}</AppButton>
          </AppDialogClose>
        </AppDialogActions>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
