import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { translate } from '../../shared/localization/translations';
import { requestAppConfirmation } from '../../shared/ui';

export function runResetImportDataCommand(args: {
  resetImportData: () => Promise<boolean>;
}) {
  const locale = getStoredAppLocale();
  void requestAppConfirmation({
    confirmLabel: translate(locale, 'desktop.feedback.resetImport.confirm'),
    description: translate(locale, 'desktop.feedback.resetImport.description'),
    title: translate(locale, 'desktop.feedback.resetImport.title')
  }).then((confirmed) => {
    if (confirmed) {
      void args.resetImportData();
    }
  });
}
