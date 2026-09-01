import { Link2 } from 'lucide-react';

import { AppIconButton, AppTooltip, AppTooltipContent, AppTooltipContentLayout, AppTooltipTrigger } from '../../shared/ui';

export function WorkspaceRightSidebarAssistantContextFollowControl(props: {
  description: string;
  enabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <AppIconButton
          aria-checked={props.enabled}
          className={`size-7 ${props.enabled
            ? 'border-border bg-[var(--app-control-bg-hover-color)] text-foreground/85'
            : 'text-foreground/48'}`}
          icon={<Link2 aria-hidden className="size-4" strokeWidth={1.8} />}
          label={props.label}
          onClick={props.onToggle}
          role="switch"
        />
      </AppTooltipTrigger>
      <AppTooltipContent align="start" side="top">
        <AppTooltipContentLayout description={props.description} title={props.label} />
      </AppTooltipContent>
    </AppTooltip>
  );
}
