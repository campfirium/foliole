import { ChevronDown, ChevronUp } from 'lucide-react';

interface ShortcutHintProps {
  keys: string[];
  label: string;
}

export function WorkspaceResultShortcutsFooter(props: {
  collapsed: boolean;
  onToggle: () => void;
  showLabel: string;
  collapseLabel: string;
  hints: ShortcutHintProps[];
}) {
  return (
    <footer className="relative flex min-h-14 shrink-0 items-center justify-center border-t border-[var(--app-floating-divider-color)] px-12 py-2.5 text-xs text-foreground/45">
      {props.collapsed ? (
        null
      ) : (
        <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-center">
          {props.hints.map((hint) => <ShortcutHint key={hint.keys.join(' ')} {...hint} />)}
        </span>
      )}
      <button
        aria-label={props.collapsed ? props.showLabel : props.collapseLabel}
        aria-expanded={!props.collapsed}
        className="absolute right-5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/32 transition-colors hover:text-foreground/58 "
        onClick={props.onToggle}
        type="button"
      >
        {props.collapsed ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
      </button>
    </footer>
  );
}

function ShortcutHint(props: ShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        {props.keys.map((key) => (
          <kbd className="font-semibold leading-none text-foreground/55" key={key}>
            {key}
          </kbd>
        ))}
      </span>
      <span>{props.label}</span>
    </span>
  );
}
