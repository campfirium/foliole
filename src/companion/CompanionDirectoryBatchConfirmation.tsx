import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

import { CompanionBottomSheet } from './CompanionBottomSheet';

export function CompanionDirectoryBatchConfirmation(props: {
  count: number;
  total: number | undefined;
  onCancel(): void;
  onConfirm(): void;
}) {
  const t = useTranslation();
  const permanent = props.total !== undefined;
  const title = t(permanent ? 'desktop.nodeList.menu.deletePermanently' : 'companion.workspace.delete');
  return <CompanionBottomSheet open title={title} onOpenChange={open => { if (!open) props.onCancel(); }}>
    <p className="py-3">{t(permanent ? 'companion.batch.purgeDescription' : 'companion.batch.trashDescription', {
      count: props.count, total: props.total ?? props.count
    })}</p>
    <div className="flex flex-wrap justify-end gap-2">
      <AppButton className="min-h-11" variant="ghost" onClick={props.onCancel}>{t('shared.confirm.cancel')}</AppButton>
      <AppButton className="min-h-11 whitespace-normal" variant={permanent ? 'danger' : 'emphasis'} onClick={props.onConfirm}>
        {title}
      </AppButton>
    </div>
  </CompanionBottomSheet>;
}
