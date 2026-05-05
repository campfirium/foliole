import { cn } from '@/shared/lib/utils';

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

function toneClass(tone: StatusTone) {
  if (tone === 'info') {
    return 'text-foreground/65';
  }
  if (tone === 'success') {
    return 'text-emerald-700';
  }
  if (tone === 'warning') {
    return 'text-amber-700';
  }
  if (tone === 'error') {
    return 'text-rose-700';
  }
  return 'text-foreground/60';
}

export function AppStatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex min-h-6 items-center gap-1.5 text-sm font-medium leading-none', toneClass(tone))}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
