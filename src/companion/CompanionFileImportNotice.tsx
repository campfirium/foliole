import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { SelectedImportWarning } from '../shared/platform/import/selectedImportFile';
import { AppButton, appShelllessSurfaceClassName } from '../shared/ui';

export function CompanionFileImportNotice(props: { warning: SelectedImportWarning | null; onClose(): void }) {
  const t = useTranslation();
  if (!props.warning) return null;
  return <div className="pointer-events-none fixed inset-0 z-workspace-overlay flex items-center justify-center px-6">
    <div className={appShelllessSurfaceClassName('pointer-events-auto flex max-w-sm flex-col gap-3 px-4 py-3 text-ui-md')}>
      <p role="alert">{t(props.warning === 'images'
        ? 'companion.capture.import.imagesUnavailable' : 'companion.capture.import.conversionIncomplete')}</p>
      <div className="flex justify-end">
        <AppButton onClick={props.onClose} variant="ghost">{t('companion.capture.close')}</AppButton>
      </div>
    </div>
  </div>;
}
