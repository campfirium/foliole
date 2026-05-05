type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(' ');
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={joinClassNames('ui-status', `ui-status-${tone}`)}>{label}</span>;
}
