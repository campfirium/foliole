export interface AnnualStatisticsGroup {
  key: string;
  label: string;
  year: number;
  current: boolean;
}

export interface AnnualStatisticsCell {
  key: string;
  label: string;
  values: readonly [number | null, number | null];
  valid: boolean;
  current: boolean;
  past: boolean;
}

interface AnnualStatisticsTableProps {
  label: string;
  dayLabel: string;
  groups: AnnualStatisticsGroup[];
  rows: { label: string; cells: AnnualStatisticsCell[] }[];
  metrics: readonly [{ shortLabel: string; label: string }, { shortLabel: string; label: string }];
}

const separator = 'border-l border-foreground/[0.055]';

export function AnnualStatisticsTable(props: AnnualStatisticsTableProps) {
  return <table aria-label={props.label} className="w-full min-w-statistics-table table-fixed border-collapse tabular-nums">
    <colgroup><col className="w-statistics-day" />{props.groups.map((group) => <col key={group.key} span={2} />)}</colgroup>
    <StatisticsHeaders {...props} />
    <tbody>{props.rows.map((row) => <tr key={row.label} className="even:bg-foreground/[0.018]">
      <th scope="row" className={`relative h-statistics-row pr-2.5 text-right text-ui-sm ${row.cells.some((cell) => cell.current) ? "font-medium text-companion-accent before:absolute before:left-0.5 before:top-1/2 before:size-1 before:-translate-y-1/2 before:rounded-full before:bg-companion-accent" : "font-normal text-foreground/56"}`}>{row.label}</th>
      {row.cells.map((cell) => <StatisticsCell key={cell.key} cell={cell} />)}
    </tr>)}</tbody>
  </table>;
}

function StatisticsHeaders(props: AnnualStatisticsTableProps) {
  const years = groupYears(props.groups);
  return <thead className="sticky top-0 z-10 bg-settings-group">
    <tr><th />{years.map((year) => <th key={year.year} colSpan={year.count * 2}
      className="h-6 text-left text-ui-xs font-normal text-foreground/50">{year.year}</th>)}</tr>
    <tr><th rowSpan={2} scope="col" className="pr-2.5 text-right text-ui-xs font-normal text-foreground/56">{props.dayLabel}</th>
      {props.groups.map((group) => <th key={group.key} scope="colgroup" colSpan={2}
        className={`${separator} h-7 text-center text-ui-base ${group.current ? 'font-medium text-companion-accent' : 'font-normal text-foreground/88'}`}>
        {group.label}
      </th>)}
    </tr>
    <tr>{props.groups.flatMap((group) => props.metrics.map((metric, index) => <th key={`${group.key}-${index}`}
      scope="col" title={metric.label} aria-label={`${group.label} ${group.year} ${metric.label}`}
      className={`${index === 0 ? separator : ''} h-6 text-center text-ui-xs font-normal text-foreground/56`}>{metric.shortLabel}</th>))}</tr>
  </thead>;
}

function StatisticsCell({ cell }: { cell: AnnualStatisticsCell }) {
  const state = !cell.valid ? 'bg-foreground/[0.035]' : cell.current
    ? 'border-b-2 border-companion-accent bg-companion-accent/10 font-medium text-companion-accent' : cell.past ? 'text-foreground/45' : 'text-foreground/85';
  return <td colSpan={2} title={cell.valid ? cell.label : undefined} className={`${separator} h-statistics-row p-0 text-ui-xs ${state}`}>
    {cell.valid ? <div role="group" aria-label={cell.label} aria-current={cell.current ? 'date' : undefined} className="grid grid-cols-2">
      {cell.values.map((value, index) => <span key={index} className="pr-1.5 text-right">{value || ''}</span>)}
    </div> : null}
  </td>;
}

function groupYears(groups: AnnualStatisticsGroup[]) {
  const years: { year: number; count: number }[] = [];
  for (const group of groups) {
    const previous = years.at(-1);
    if (previous?.year === group.year) previous.count++;
    else years.push({ year: group.year, count: 1 });
  }
  return years;
}
