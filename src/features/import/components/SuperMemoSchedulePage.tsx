import { useMemo } from 'react';

import { blendSuperMemoDue } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoPreview, NativeSuperMemoPreviewRow } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { FirstReviewChanges } from './SuperMemoDirectoryUpdate';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';

function getDateSamples(rows: NativeSuperMemoPreviewRow[]) {
  const examples: NativeSuperMemoPreviewRow[] = [];
  const exceptions: NativeSuperMemoPreviewRow[] = [];
  let exceptionCount = 0;
  for (const row of rows) {
    if (row.outcome !== 'item' || row.issue || row.sourceState === 'pending' || row.sourceState === 'dismissed') continue;
    if (!row.sourceDue || !row.recalculatedDue || row.historyNeedsReview) {
      exceptionCount++;
      if (exceptions.length < 5) exceptions.push(row);
    } else if (examples.length < 5) examples.push(row);
  }
  return { examples, exceptions, exceptionCount };
}

function DateSamples({ rows, percent }: { rows: NativeSuperMemoPreviewRow[]; percent: number }) {
  const t = useTranslation();
  const unavailable = t('desktop.superMemoDrafts.scheduleNoDate');
  return <div className="overflow-x-auto">
    <table className="w-full text-left text-xs tabular-nums [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2">
      <thead className="border-b border-settings-divider">
        <tr>
          <th scope="col">{t('desktop.superMemoDrafts.scheduleItem')}</th>
          <th scope="col">{t('desktop.superMemoDrafts.scheduleSourceDate')}</th>
          <th scope="col">{t('desktop.superMemoDrafts.scheduleRecalculatedDate')}</th>
          <th scope="col">{t('desktop.superMemoDrafts.schedulePlannedDate')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-settings-divider">
        {rows.map(row => <tr key={row.id}>
          <th scope="row" className="break-words font-medium">
            {row.title || `#${row.id}`}
            {row.historyNeedsReview ? <p className="mt-1 font-normal text-foreground/70">
              {t('desktop.superMemoDrafts.issue.history', { history: row.historyCount })}
            </p> : null}
          </th>
          <td>{row.sourceDue ?? unavailable}</td>
          <td>{row.recalculatedDue ?? unavailable}</td>
          <td>{blendSuperMemoDue(row.sourceDue, row.recalculatedDue, percent) ?? unavailable}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function ScheduleResults({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const t = useTranslation();
  const { examples, exceptions, exceptionCount } = useMemo(() => getDateSamples(preview.rows), [preview.rows]);
  return <>
    <section className="grid min-w-0 gap-3 border-t border-settings-divider pt-4">
      <h4 className="text-sm font-semibold">{t('desktop.superMemoDrafts.scheduleDueOn', { date: preview.referenceDay })}</h4>
      <SuperMemoDraftTable preview={preview} percent={percent} />
    </section>
    {examples.length ? <section className="grid min-w-0 gap-2">
      <h4 className="text-sm font-semibold">{t('desktop.superMemoDrafts.scheduleExamples')}</h4>
      <DateSamples rows={examples} percent={percent} />
    </section> : null}
    {exceptionCount ? <details className="min-w-0 space-y-2 border-t border-settings-divider pt-4 text-sm">
      <summary className="cursor-pointer font-semibold">{t('desktop.superMemoDrafts.scheduleExceptions', { count: exceptionCount })}</summary>
      {exceptionCount > exceptions.length ? <p className="text-xs text-foreground/70">
        {t('desktop.superMemoDrafts.scheduleExceptionSample')}
      </p> : null}
      <DateSamples rows={exceptions} percent={percent} />
    </details> : null}
  </>;
}

export function SuperMemoSchedulePage({ preview, percent, setPercent, busy }: {
  preview: NativeSuperMemoPreview;
  percent: number;
  setPercent(value: number): void;
  busy: boolean;
}) {
  const t = useTranslation();
  return <div className="grid min-w-0 gap-4">
    {preview.directoryUpdate ? <>
      <p className="text-sm">{t('desktop.superMemoDrafts.scheduleUpdateHelp')}</p>
      <FirstReviewChanges changes={preview.directoryUpdate.firstReviewChanges} showHeading={false} />
    </> : <>
      <section className="grid min-w-0 gap-2">
        <SuperMemoPreviewOptionFields compact percent={percent} onChange={setPercent} disabled={busy} />
        <p className="text-xs leading-relaxed text-foreground/70">
          {t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}
        </p>
      </section>
      <ScheduleResults preview={preview} percent={percent} />
    </>}
    <p className="text-xs text-foreground/70">{t('desktop.superMemoDrafts.scheduleBatchHelp')}</p>
  </div>;
}
