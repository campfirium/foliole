import { memo, useMemo } from 'react';

import { makeSuperMemoPreviewReport } from '../../../../lib/core/import/superMemoPreviewReport';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export const SuperMemoDraftTable = memo(function SuperMemoDraftTable({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const t = useTranslation();
  const report = useMemo(() => makeSuperMemoPreviewReport(preview, percent), [preview, percent]);
  return (
    <div className="min-w-0 space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-4">
        <ScheduleCount featured label={t('desktop.superMemoDrafts.originallyDue')} value={report.sourceDue} />
        <ScheduleCount featured label={t('desktop.superMemoDrafts.dueAfterImport')} value={report.totalDue} />
      </dl>
      {report.shifts.length > 0 ? <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs tabular-nums [&_td]:px-2 [&_td]:py-2 [&_td:first-child]:text-left [&_th]:px-2 [&_th]:py-2 [&_th:first-child]:text-left">
          <thead className="border-y border-[var(--role-content-line)] text-foreground/75"><tr>
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
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-2">
        <ScheduleCount label={t('desktop.superMemoDrafts.newlyDue')} value={report.addedDue} />
        <ScheduleCount label={t('desktop.superMemoDrafts.noLongerDue')} value={report.deferred} />
        <ScheduleCount label={t('desktop.superMemoDrafts.datesUnavailable')} value={report.unknownDates} />
        <ScheduleCount label={t('desktop.superMemoDrafts.withoutHistory')} value={report.noHistory} />
        {report.pendingNewItems > 0 ? <ScheduleCount label={t('desktop.superMemoDrafts.newCards')} value={report.pendingNewItems} /> : null}
      </dl>
    </div>
  );
});

function ScheduleCount({ label, value, featured = false }: { label: string; value: number; featured?: boolean }) {
  return (
    <div className={featured ? "grid content-start gap-1 border-l border-[var(--role-content-line)] pl-3" : "flex flex-wrap items-baseline gap-x-2"}>
      <dt className="text-xs text-foreground/70">{label}</dt>
      <dd className={featured ? "text-2xl font-semibold tabular-nums" : "text-sm font-medium tabular-nums"}>{value.toLocaleString()}</dd>
    </div>
  );
}
