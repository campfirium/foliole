import type { ReactNode } from 'react';

export function SettingsChoiceMatrix(props: {
  ariaLabel: string;
  columns: [string, string];
  rows: Array<{
    cells: [ReactNode, ReactNode];
    label: string;
  }>;
}) {
  const splitIndex = Math.ceil(props.rows.length / 2);
  const rowGroups = props.rows.length > 4
    ? [props.rows.slice(0, splitIndex), props.rows.slice(splitIndex)]
    : [props.rows];
  return (
    <div
      aria-label={props.ariaLabel}
      className={`grid w-full gap-x-10 gap-y-6 overflow-x-auto px-settings-panel-x pb-settings-panel-y ${
        rowGroups.length > 1 ? 'grid-cols-2 max-[1180px]:grid-cols-1' : 'grid-cols-1'
      }`}
      role="group"
    >
      {rowGroups.map((rows, groupIndex) => (
        <div className="min-w-0" key={`group:${groupIndex}`}>
          <div className="grid grid-cols-[minmax(4rem,1fr)_repeat(2,9rem)] items-center gap-x-3">
            <span aria-hidden="true" />
            {props.columns.map((column) => (
              <span className="px-2 text-sm text-foreground/65" key={column}>{column}</span>
            ))}
          </div>
          <div className="mt-2 grid gap-y-2">
            {rows.map((row) => (
              <div className="grid grid-cols-[minmax(4rem,1fr)_repeat(2,9rem)] items-center gap-x-3" key={row.label}>
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                {row.cells.map((cell, cellIndex) => (
                  <div className="min-w-0" key={`${row.label}:${cellIndex}`}>{cell}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
