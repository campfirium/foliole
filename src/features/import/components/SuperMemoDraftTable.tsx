import { memo, useMemo } from 'react';

import { makeSuperMemoPreviewReport } from '../../../../lib/core/import/superMemoPreviewReport';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export const SuperMemoDraftTable = memo(function SuperMemoDraftTable({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const t = useTranslation();
  const report = useMemo(() => makeSuperMemoPreviewReport(preview, percent), [preview, percent]);
  return (
    <article className="min-h-0 space-y-3 overflow-auto text-sm">
      {report.shifts.length > 0 ? <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-sm tabular-nums [&_td]:px-3 [&_td]:py-2 [&_td:first-child]:text-left [&_th]:px-3 [&_th]:py-2 [&_th:first-child]:text-left">
          <thead className="bg-foreground/5"><tr>
            <th scope="col" className="font-semibold">{t('desktop.superMemoDrafts.intervalGroup')}</th>
            <th scope="col" className="font-semibold">{t('desktop.superMemoDrafts.cards')}</th>
            <th scope="col" className="font-semibold">{t('desktop.superMemoDrafts.sourceMedian')}</th>
            <th scope="col" className="font-semibold">{t('desktop.superMemoDrafts.shiftMedian')}</th>
          </tr></thead>
          <tbody>{report.shifts.map(group => (
            <tr className="border-b border-[var(--role-content-line)]" key={group.label}><td>{group.label}</td><td>{group.count}</td>
              <td>{group.source}</td><td>{group.offset > 0 ? '+' : ''}{group.offset}</td></tr>
          ))}</tbody>
        </table>
      </div> : null}
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <ScheduleCount label={t('desktop.superMemoDrafts.originallyDue')} value={report.sourceDue} />
        <ScheduleCount label={t('desktop.superMemoDrafts.dueAfterImport')} value={report.totalDue} />
        <ScheduleCount label={t('desktop.superMemoDrafts.newlyDue')} value={report.addedDue} />
        <ScheduleCount label={t('desktop.superMemoDrafts.noLongerDue')} value={report.deferred} />
        <ScheduleCount label={t('desktop.superMemoDrafts.datesUnavailable')} value={report.unknownDates} />
        <ScheduleCount label={t('desktop.superMemoDrafts.withoutHistory')} value={report.noHistory} />
        {report.pendingNewItems > 0 ? <ScheduleCount label={t('desktop.superMemoDrafts.newCards')} value={report.pendingNewItems} /> : null}
      </dl>
    </article>
  );
});

function ScheduleCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-row-reverse items-baseline justify-end gap-1.5">
      <dt className="text-xs text-foreground/70">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
