import { requestAppConfirmation } from '../../shared/ui';

export function runResetImportDataCommand(args: {
  resetImportData: () => Promise<boolean>;
}) {
  void requestAppConfirmation({
    confirmLabel: 'Reset',
    description: 'Imported topics and import records will be removed. This cannot be undone.',
    title: 'Reset imported topics?'
  }).then((confirmed) => {
    if (confirmed) {
      void args.resetImportData();
    }
  });
}
