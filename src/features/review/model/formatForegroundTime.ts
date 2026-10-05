export function formatForegroundTime(durationMs: number | null, locale: string) {
  if (durationMs === null) return '';
  const minutes = Math.floor(durationMs / 60_000);
  const minute = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'narrow' });
  if (durationMs > 0 && minutes === 0) return `<${minute.format(1)}`;
  return minute.format(minutes);
}
