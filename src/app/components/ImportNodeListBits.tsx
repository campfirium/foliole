import type { ReactNode } from 'react';

export function renderImportTitle(value: ReactNode) {
  return <span className="line-clamp-2 block break-words text-[17px] font-normal leading-7 text-foreground">{value}</span>;
}

export function renderImportOpening(value: string) {
  return <span className="block line-clamp-3 text-[15px] leading-7 text-foreground/74">{value}</span>;
}

export function renderImportDate(label: string, prefix: string) {
  return <span aria-label={`${prefix} ${label}`} className="block text-[13px] leading-5 text-foreground/56">{label}</span>;
}

export function renderImportMeta(value: string) {
  return <span className="block min-h-5 min-w-0 break-all text-[13px] leading-5 text-foreground/56">{value}</span>;
}
