import { CalendarDays, FileText, FolderTree, Link2, ListChecks, ScanSearch, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogClose, AppDialogContent, AppDialogOverlay, AppDialogPortal,
  AppDialogTitle, SettingsNavigation, SettingsNavigationGroup, SettingsNavigationItem, settingsNestedDialogSurfaceClassName
} from '../../../shared/ui';
import { settingsDialogGrid, settingsDialogPane, settingsDialogPaneBody } from '../../../shared/ui/settingsDialogBounds';

import { CitationChanges, DirectoryChanges, FirstReviewChanges, SourceMatch, TextChanges } from './SuperMemoDirectoryUpdate';
import { SuperMemoWithdrawals } from './SuperMemoWithdrawals';

const reviewCategories = [
  { id: 'source', label: 'exportMatch', Icon: ScanSearch },
  { id: 'directory', label: 'directoryChanges', Icon: FolderTree },
  { id: 'text', label: 'textChanges', Icon: FileText },
  { id: 'citation', label: 'citationChanges', Icon: Link2 },
  { id: 'schedule', label: 'firstReviewChanges', Icon: CalendarDays },
  { id: 'withdrawals', label: 'withdrawals', Icon: Trash2 },
  { id: 'summary', label: 'updateSummary', Icon: ListChecks }
] as const;
type Category = (typeof reviewCategories)[number]['id'];

function canApplyUpdate(update: NativeSuperMemoDirectoryUpdate, selected: number[]) {
  return !update.pairedSourceRequired && (!update.sourceMatch || update.sourceMatch.status === 'verified') && (
    update.hasRuleCorrections || update.proposedPercent !== undefined || update.sourceMatch?.linkOnConfirm === true || selected.length > 0 ||
    update.changes.some(change => change.status === 'move' || change.status === 'anchor' || change.status === 'add') ||
    update.citationChanges.some(change => change.status === 'update') ||
    update.textChanges.some(change => change.status === 'update') ||
    update.firstReviewChanges.some(change => change.status === 'update' || change.status === 'basis')
  );
}

function availableCategories(update: NativeSuperMemoDirectoryUpdate) {
  if (update.sourceMatch && update.sourceMatch.status !== 'verified') return reviewCategories.filter(({ id }) => id === 'source');
  const visible: Record<Category, boolean | undefined> = {
    source: Boolean(update.sourceMatch),
    directory: update.changes.length > 0,
    text: update.textChanges.length > 0,
    citation: update.citationChanges.length > 0,
    schedule: update.firstReviewChanges.length > 0 || update.proposedPercent !== undefined,
    withdrawals: update.withdrawals.length > 0,
    summary: update.pairedSourceRequired
  };
  const categories = reviewCategories.filter(({ id }) => update.pairedSourceRequired ? id === 'summary' : visible[id]);
  return categories.length ? categories : reviewCategories.filter(({ id }) => id === 'summary');
}

function ReviewDetails({ category, update, busy, selected, onSelect }: {
  category: Category; update: NativeSuperMemoDirectoryUpdate; busy: boolean; selected: number[]; onSelect(ids: number[]): void;
}) {
  const t = useTranslation();
  switch (category) {
    case 'source': return update.sourceMatch ? <SourceMatch match={update.sourceMatch} /> : null;
    case 'directory': return <DirectoryChanges changes={update.changes} />;
    case 'text': return <TextChanges changes={update.textChanges} />;
    case 'citation': return <CitationChanges changes={update.citationChanges} />;
    case 'schedule': return <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.firstReviewChanges')}</h2>
      {update.proposedPercent !== undefined && update.savedPercent !== undefined ? <p className="text-sm">
        {t('desktop.superMemoDrafts.reviewWeightChange', { from: update.savedPercent, to: update.proposedPercent })}
      </p> : null}
      <FirstReviewChanges changes={update.firstReviewChanges} showHeading={false} />
    </section>;
    case 'withdrawals': return <SuperMemoWithdrawals candidates={update.withdrawals} selected={selected} disabled={busy} onChange={onSelect} />;
    case 'summary': return <p className="text-sm">{t(update.pairedSourceRequired
      ? 'desktop.superMemoDrafts.updateNeedsCollection' : 'desktop.superMemoDrafts.noBatchChanges')}</p>;
  }
}

export function SuperMemoUpdateReview({ update, busy, onClose, onApply }: {
  update: NativeSuperMemoDirectoryUpdate; busy: boolean; onClose(): void; onApply(selected: number[]): void;
}) {
  const t = useTranslation();
  const titleId = useId();
  const title = t('desktop.superMemoDrafts.reviewUpdates');
  const categories = availableCategories(update);
  const [active, setActive] = useState<Category>(() => categories[0]!.id);
  const [selected, setSelected] = useState<number[]>([]);
  const counts: Partial<Record<Category, number>> = {
    directory: update.changes.length, text: update.textChanges.length, citation: update.citationChanges.length,
    schedule: update.firstReviewChanges.length, withdrawals: update.withdrawals.length
  };
  return <AppDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <AppDialogPortal>
      <AppDialogOverlay />
      <AppDialogContent aria-labelledby={titleId} aria-describedby={undefined}
        className={settingsNestedDialogSurfaceClassName('group', settingsDialogGrid)}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <SettingsNavigation ariaLabel={title} navigationLabel={t('desktop.superMemoDrafts.updateCategories')}
          title={<AppDialogTitle id={titleId}
            className="m-0 max-w-[200px] pl-[calc(var(--spacing)*2+1px)] text-settings-brand font-semibold leading-tight [overflow-wrap:anywhere]">
            {title}
          </AppDialogTitle>}>
          <SettingsNavigationGroup>
            {categories.map(({ id, label, Icon }) => <SettingsNavigationItem key={id} icon={Icon}
              current={active === id ? 'page' : undefined} onClick={() => setActive(id)}>
              {t(`desktop.superMemoDrafts.${label}`)}
              {counts[id] ? <>{' '}<span className="tabular-nums text-foreground/65">({counts[id]})</span></> : null}
            </SettingsNavigationItem>)}
          </SettingsNavigationGroup>
        </SettingsNavigation>
        <div className={settingsDialogPane}>
          <div key={active} className={`${settingsDialogPaneBody} [overflow-wrap:anywhere]`}>
            <ReviewDetails category={active} update={update} busy={busy} selected={selected} onSelect={setSelected} />
          </div>
          <AppDialogActions className="m-0 min-h-14 flex-wrap border-t border-settings-divider/55 px-7 py-2">
            {selected.length ? <p className="mr-auto min-w-0 text-sm">{t('desktop.superMemoDrafts.confirmTrash', { count: selected.length })}</p> : null}
            <AppDialogClose asChild><AppButton disabled={busy}>{t('desktop.superMemoDrafts.close')}</AppButton></AppDialogClose>
            <AppButton loading={busy} loadingLabel={t('desktop.superMemoDrafts.updating')}
              disabled={!canApplyUpdate(update, selected)} onClick={() => onApply(selected)}>
              {t('desktop.superMemoDrafts.confirmUpdate')}
            </AppButton>
          </AppDialogActions>
        </div>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
