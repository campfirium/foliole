import { Badge } from '@/components/ui/badge';
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
    return 'border-amber-300 bg-amber-100/70 text-amber-500';
  }
  if (tone === 'error') {
    return 'border-rose-300 bg-rose-100/70 text-rose-500';
  }
  return 'border-slate-300 bg-slate-100/70 text-slate-500';
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return <Badge className={cn(toneClass(tone))}>{label}</Badge>;
}
