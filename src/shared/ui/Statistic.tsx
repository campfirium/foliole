export function AppStatistic({ label, value }: { label: string; value: string }) {
  return <div className="mb-3 flex items-baseline gap-2 text-ui-sm text-foreground/76">
    <span>{label}</span><output aria-label={label} className="tabular-nums">{value}</output>
  </div>;
}
