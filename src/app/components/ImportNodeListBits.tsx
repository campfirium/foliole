import type { ReactNode } from 'react';

export function renderImportTitle(value: ReactNode) {
  return <span className="line-clamp-2 block text-[17px] leading-7 text-foreground">{value}</span>;
}

export function renderImportOpening(value: string) {
  return <span className="block min-h-14 line-clamp-2 text-[15px] leading-7 text-foreground/74">{value}</span>;
}

export function renderImportDate(label: string, prefix: string) {
  return <span className="block pt-1 text-[13px] leading-5 text-foreground/56">{prefix} {label}</span>;
}

export function renderImportMeta(value: string) {
  return <span className="block min-w-0 break-all text-[13px] leading-5 text-foreground/56">{value}</span>;
}
