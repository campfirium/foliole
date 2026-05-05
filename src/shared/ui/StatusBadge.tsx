import { Badge } from '@radix-ui/themes';

import { cn } from '@/lib/utils';

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

function toneClass(tone: StatusTone) {
  if (tone === 'info') {
    return 'border-blue-300 bg-blue-100/70 text-blue-500';
  }
  if (tone === 'success') {
    return 'border-emerald-300 bg-emerald-100/70 text-emerald-500';
  }
  if (tone === 'warning') {
    return 'border-amber-300 bg-amber-100/70 text-amber-600';
  }
  if (tone === 'error') {
    return 'border-rose-300 bg-rose-100/70 text-rose-500';
  }
  return 'border-border bg-secondary/60 text-foreground/70';
}

export function AppStatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <Badge className={cn('min-h-6 rounded-full border px-2 text-xs font-semibold', toneClass(tone))} radius="full">
      {label}
    </Badge>
  );
}
