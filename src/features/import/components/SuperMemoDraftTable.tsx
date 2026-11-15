import { makeSuperMemoPreviewReport } from '../../../../lib/core/import/superMemoPreviewReport';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoDraftTable({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const t = useTranslation();
  const report = makeSuperMemoPreviewReport(preview, percent);
  return (
    <article className="min-h-0 space-y-3 overflow-auto text-sm">
      {report.shifts.length > 0 ? (
        <table className="w-full border-collapse text-left text-xs tabular-nums [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
          <thead className="bg-foreground/5"><tr>
            <th>{t('desktop.superMemoDrafts.intervalGroup')}</th>
            <th>{t('desktop.superMemoDrafts.cards')}</th>
            <th>{t('desktop.superMemoDrafts.sourceMedian')}</th>
            <th>{t('desktop.superMemoDrafts.shiftMedian')}</th>
          </tr></thead>
          <tbody>{report.shifts.map(group => (
            <tr className="border-b border-foreground/10" key={group.label}><td>{group.label}</td><td>{group.count}</td>
              <td>{group.source}</td><td>{group.offset > 0 ? '+' : ''}{group.offset}</td></tr>
          ))}</tbody>
        </table>
      ) : null}
      <p>{t('desktop.superMemoDrafts.loadChange', {
        original: report.sourceDue, planned: report.totalDue, added: report.addedDue,
        deferred: report.deferred, unknown: report.unknownDates, noHistory: report.noHistory
      })}</p>
      {report.pendingNewItems > 0 ? <p>{t('desktop.superMemoDrafts.pendingNewItems', { count: report.pendingNewItems })}</p> : null}
    </article>
  );
}
