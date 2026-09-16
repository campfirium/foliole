import type { ReactNode } from 'react';

export function SettingsChoiceMatrix(props: {
  ariaLabel: string;
  columns: [string, string];
  rows: Array<{
    cells: [ReactNode, ReactNode];
    label: string;
  }>;
}) {
  return (
    <div
      aria-label={props.ariaLabel}
      className="grid w-full grid-cols-2 gap-x-12 gap-y-6 overflow-x-auto px-settings-panel-x pb-settings-panel-y max-[1080px]:grid-cols-1"
      role="group"
    >
      {props.columns.map((column, columnIndex) => (
        <div className="min-w-0" key={column}>
          <span className="block px-2 text-sm text-foreground/65">{column}</span>
          <div className="mt-2 grid gap-y-2">
            {props.rows.map((row) => (
              <div
                className="grid grid-cols-[minmax(5rem,1fr)_9rem] items-center gap-x-4"
                key={`${column}:${row.label}`}
              >
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                <div className="min-w-0">{row.cells[columnIndex]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
