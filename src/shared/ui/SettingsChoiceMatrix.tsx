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
      className="grid w-full grid-cols-[minmax(5rem,1fr)_repeat(2,9rem)] items-center gap-x-4 gap-y-2 overflow-x-auto px-settings-panel-x pb-settings-panel-y"
      role="group"
    >
      <span aria-hidden="true" />
      {props.columns.map((column) => (
        <span className="px-2 text-sm text-foreground/65" key={column}>{column}</span>
      ))}
      {props.rows.flatMap((row) => [
        <span className="text-sm font-medium text-foreground" key={`${row.label}:label`}>
          {row.label}
        </span>,
        ...row.cells.map((cell, index) => (
          <div className="min-w-0" key={`${row.label}:${index}`}>{cell}</div>
        ))
      ])}
    </div>
  );
}
