import { Link2 } from 'lucide-react';

export function WorkspaceRightSidebarAssistantContextFollowControl(props: {
  description: string;
  enabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-checked={props.enabled}
      className={`flex min-w-0 items-center gap-1.5 text-ui-xs leading-5 ${props.enabled ? 'text-accent' : 'text-foreground/48'}`}
      onClick={props.onToggle}
      role="switch"
      title={props.description}
      type="button"
    >
      <Link2 aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
      <span className="truncate">{props.label}</span>
    </button>
  );
}
