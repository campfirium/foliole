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
      className="grid grid-cols-[minmax(4rem,auto)_repeat(2,minmax(0,1fr))] items-center gap-x-4 gap-y-3"
      role="group"
    >
      <span aria-hidden="true" />
      {props.columns.map((column) => (
        <span className="text-sm text-foreground/65" key={column}>{column}</span>
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
