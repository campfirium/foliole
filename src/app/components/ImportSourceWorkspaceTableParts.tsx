import { FolderOpen } from 'lucide-react';

import { cn } from '../../shared/lib/utils';
import { AppButton, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

function compactPathLabel(path: string, emptyLabel: string) {
  if (path.trim().length === 0) {
    return emptyLabel;
  }
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function resolveFolderPathTooltip(path: string) {
  return path.trim().length > 0 ? path : undefined;
}

export function FolderButton({
  label,
  path,
  tooltip,
  disabled = false,
  onClick,
  className
}: {
  label: string;
  path: string;
  tooltip?: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const button = (
    <AppButton
      aria-label={label}
      className={cn(
        'h-10 w-full min-w-0 justify-between rounded-md border border-settings-control-border bg-settings-control px-3 text-left text-sm text-foreground/75 disabled:border-settings-control-border disabled:bg-settings-switch-off disabled:text-foreground/40',
        className
      )}
      disabled={disabled}
      onClick={onClick}
      variant="ghost"
    >
      <span className="min-w-0 truncate">{path}</span>
      <FolderOpen aria-hidden="true" className="shrink-0 text-settings-icon" size={13} strokeWidth={1.8} />
    </AppButton>
  );

  if (disabled || !tooltip) {
    return button;
  }

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>{button}</AppTooltipTrigger>
      <AppTooltipContent layer="dropdown">{tooltip}</AppTooltipContent>
    </AppTooltip>
  );
}

export function resolveFolderPathLabel(path: string, emptyLabel: string) {
  return compactPathLabel(path, emptyLabel);
}

export function resolveFolderPathHint(path: string) {
  return resolveFolderPathTooltip(path);
}
