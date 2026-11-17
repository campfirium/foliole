import { useMemo } from 'react';

import type { NativeSuperMemoPreviewRow } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SuperMemoDirectoryUpdate, SuperMemoResult } from './SuperMemoDirectoryUpdate';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoWithdrawals } from './SuperMemoWithdrawals';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

type Draft = ReturnType<typeof useSuperMemoDraft>;
type Row = NativeSuperMemoPreviewRow;

const gradeLabels = [
  'desktop.reviewActions.grade.again',
  'desktop.reviewActions.grade.hard',
  'desktop.reviewActions.grade.good',
  'desktop.reviewActions.grade.easy'
] as const;

const placementLabels = {
  metadata: 'desktop.superMemoDrafts.sourceMetadata',
  body: 'desktop.superMemoDrafts.sourceBody',
  'topic-info': 'desktop.superMemoDrafts.sourceTopicInfo',
  'content-end': 'desktop.superMemoDrafts.sourceContentEnd'
} as const;

function ConfirmationSettings({ model, updating }: { model: Draft; updating: boolean }) {
  const t = useTranslation();
  const { sourceFormat, percent, gradeMap } = model;
  return <section className="grid gap-2 rounded-lg border border-settings-divider p-4 text-sm">
    <h4 className="font-semibold">{t(updating ? 'desktop.superMemoDrafts.confirmExisting' : 'desktop.superMemoDrafts.confirmNew')}</h4>
    <dl className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
      <dt className="text-foreground/70">{t('desktop.superMemoDrafts.sourceTitle')}</dt>
      <dd className="break-words">{model.source?.name}</dd>
      <dt className="text-foreground/70">{t('desktop.superMemoDrafts.blend')}</dt>
      <dd>{updating ? t('desktop.superMemoDrafts.confirmSavedBlend') : t('desktop.superMemoDrafts.confirmBlend', { percent })}</dd>
      <dt className="text-foreground/70">{t('desktop.superMemoDrafts.gradeMapping')}</dt>
      <dd className="flex flex-wrap gap-x-3 gap-y-1">{gradeMap.map((rating, grade) => (
        <span key={grade}>SM {grade} → {t(gradeLabels[rating - 1]!)}</span>
      ))}</dd>
      <dt className="text-foreground/70">{t('desktop.superMemoDrafts.sourceInformation')}</dt>
      <dd>{t(placementLabels[sourceFormat.placement])}</dd>
    </dl>
  </section>;
}

function describeRows(rows: Row[]) {
  const issues = new Map<NonNullable<Row['issue']>, number>();
  let skipped = 0, history = 0, images = 0, audio = 0;
  for (const row of rows) {
    if (row.outcome === 'skipped') skipped++;
    if (row.issue) issues.set(row.issue, (issues.get(row.issue) ?? 0) + 1);
    if (row.outcome === 'skipped' || row.outcome === 'folder') continue;
    if (row.historyNeedsReview) history++;
    for (const image of row.unresolvedImages ?? []) images += image.count;
    audio += row.skippedAudio ?? 0;
  }
  return { issues, skipped, history, images, audio };
}

function ConversionSummary({ rows, updating }: { rows: Row[]; updating: boolean }) {
  const t = useTranslation();
  const { issues, skipped, history, images, audio } = useMemo(() => describeRows(rows), [rows]);
  return <section className="grid gap-2 rounded-lg border border-settings-divider p-4 text-sm">
    <h4 className="font-semibold">{t('desktop.superMemoDrafts.confirmExceptions')}</h4>
    {!updating ? <p>{t('desktop.superMemoDrafts.confirmTotals', { converted: rows.length - skipped, skipped })}</p> : null}
    {issues.size || history || images || audio ? <ul className="list-disc space-y-1 pl-5 text-foreground/75">
      {[...issues].map(([issue, count]) => <li key={issue}>
        {t(`desktop.superMemoDrafts.confirmIssue.${issue}`, { count })}
      </li>)}
      {history > 0 ? <li>{t('desktop.superMemoDrafts.confirmHistory', { count: history })}</li> : null}
      {images > 0 ? <li>{t('desktop.superMemoDrafts.unresolvedImages', { count: images })}</li> : null}
      {audio > 0 ? <li>{t('desktop.superMemoDrafts.confirmAudio', { count: audio })}</li> : null}
    </ul> : <p className="text-foreground/75">{t('desktop.superMemoDrafts.confirmNoExceptions')}</p>}
  </section>;
}

export function SuperMemoConfirmMigration({ model, selected, onSelect }: {
  model: Draft; selected: number[]; onSelect(ids: number[]): void;
}) {
  const t = useTranslation();
  const { draft, result, percent, sourceFormat, changeSourceFormat, busy } = model;
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const addedRows = useMemo(() => {
    if (!update || !preview) return [];
    const added = new Set(update.changes.filter(change => change.status === 'add').map(change => change.sourceId));
    return preview.rows.filter(row => added.has(row.id));
  }, [preview, update]);
  if (result) return <section className="grid gap-2 rounded-lg border border-settings-divider p-4 text-sm">
    <h4 className="font-semibold">{t('desktop.superMemoDrafts.confirmResult')}</h4>
    <SuperMemoResult result={result} />
  </section>;
  if (!preview) return null;
  return <>
    <ConfirmationSettings model={model} updating={Boolean(update)} />
    {!update ? <>
      <ConversionSummary rows={preview.rows} updating={false} />
      <details className="space-y-3 rounded-lg border border-settings-divider p-4 text-sm">
        <summary className="cursor-pointer font-semibold">{t('desktop.superMemoDrafts.scheduleImpact')}</summary>
        <SuperMemoDraftTable preview={preview} percent={percent} />
      </details>
    </> : <>
      <SuperMemoDirectoryUpdate update={update} sourceFormat={sourceFormat} disabled={busy} onSourceFormatChange={changeSourceFormat} />
      {addedRows.length ? <ConversionSummary rows={addedRows} updating /> : null}
      <SuperMemoWithdrawals candidates={update.withdrawals} selected={selected} disabled={busy} onChange={onSelect} />
      {selected.length ? <p className="text-sm">{t('desktop.superMemoDrafts.confirmTrash', { count: selected.length })}</p> : null}
    </>}
  </>;
}
