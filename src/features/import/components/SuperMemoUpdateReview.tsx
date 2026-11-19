import { useState } from 'react';

import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';

import { SuperMemoDirectoryUpdate } from './SuperMemoDirectoryUpdate';
import { SuperMemoWithdrawals } from './SuperMemoWithdrawals';

function canApplyUpdate(update: NativeSuperMemoDirectoryUpdate, selected: number[]) {
  return !update.pairedSourceRequired && (!update.sourceMatch || update.sourceMatch.status === 'verified') && (
    update.proposedPercent !== undefined || update.sourceMatch?.linkOnConfirm === true || selected.length > 0 ||
    update.changes.some(change => change.status === 'move' || change.status === 'anchor' || change.status === 'add') ||
    update.citationChanges.some(change => change.status === 'update') ||
    update.textChanges.some(change => change.status === 'update') ||
    update.firstReviewChanges.some(change => change.status === 'update' || change.status === 'basis')
  );
}

export function SuperMemoUpdateReview({ update, busy, onClose, onApply }: {
  update: NativeSuperMemoDirectoryUpdate; busy: boolean; onClose(): void; onApply(selected: number[]): void;
}) {
  const t = useTranslation();
  const [selected, setSelected] = useState<number[]>([]);
  return <AppDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <AppDialogPortal>
      <AppDialogOverlay />
      <AppDialogContent layout="notice" aria-describedby={undefined} onEscapeKeyDown={event => {
        if (busy) event.preventDefault();
      }}>
        <AppDialogTitle>{t('desktop.superMemoDrafts.reviewUpdates')}</AppDialogTitle>
        <AppDialogBody className="grid gap-4">
          {update.proposedPercent !== undefined && update.savedPercent !== undefined ? <p className="text-sm">
            {t('desktop.superMemoDrafts.reviewWeightChange', { from: update.savedPercent, to: update.proposedPercent })}
          </p> : null}
          <SuperMemoDirectoryUpdate update={update} />
          <SuperMemoWithdrawals candidates={update.withdrawals} selected={selected} disabled={busy} onChange={setSelected} />
          {selected.length ? <p className="text-sm">{t('desktop.superMemoDrafts.confirmTrash', { count: selected.length })}</p> : null}
        </AppDialogBody>
        <AppDialogActions>
          <AppDialogClose asChild><AppButton disabled={busy}>{t('desktop.superMemoDrafts.close')}</AppButton></AppDialogClose>
          <AppButton loading={busy} loadingLabel={t('desktop.superMemoDrafts.updating')}
            disabled={!canApplyUpdate(update, selected)} onClick={() => onApply(selected)}>
            {t('desktop.superMemoDrafts.confirmUpdate')}
          </AppButton>
        </AppDialogActions>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
