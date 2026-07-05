import { useEffect } from 'react';

interface DiscourseShortcutItem {
  id: string;
  label: string;
  selected?: boolean;
}

function ShortcutNumber(props: { value: string }) {
  return <span className="shrink-0 text-foreground/42 tabular-nums">{props.value}</span>;
}

export function useDiscourseEscapeClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return undefined;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape, { capture: true });
    document.addEventListener('keyup', closeOnEscape, { capture: true });
    return () => {
      document.removeEventListener('keydown', closeOnEscape, { capture: true });
      document.removeEventListener('keyup', closeOnEscape, { capture: true });
    };
  }, [active, onClose]);
}

export function DiscourseShortcutGrid(props: {
  items: DiscourseShortcutItem[];
  moreLabel?: string;
  onMore: () => void;
  onSelect: (item: DiscourseShortcutItem) => void;
  preventMouseDownDefault?: boolean;
}) {
  const shortcuts = props.items.slice(0, 9);
  const hasMore = props.items.length > 9;
  return (
    <div className="grid min-h-[5rem] grid-cols-5 gap-2">
      {shortcuts.map((item, index) => (
        <button
          className={`inline-flex h-9 min-w-0 items-center justify-start gap-2 rounded-md border px-3 text-ui-md transition-colors ${
            item.selected
              ? 'border-border-strong bg-settings-control text-foreground'
              : 'border-settings-control-border bg-settings-control text-foreground/72 hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground'
          }`}
          key={item.id}
          onClick={() => props.onSelect(item)}
          onMouseDown={props.preventMouseDownDefault ? (event) => event.preventDefault() : undefined}
          tabIndex={-1}
          type="button"
        >
          <ShortcutNumber value={String(index + 1)} />
          <span className="min-w-0 truncate">{item.label}</span>
        </button>
      ))}
      {hasMore ? (
        <button
          className="inline-flex h-9 min-w-0 items-center justify-start gap-2 rounded-md border border-settings-control-border bg-settings-control px-3 text-ui-md text-foreground/66 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground"
          onClick={props.onMore}
          onMouseDown={props.preventMouseDownDefault ? (event) => event.preventDefault() : undefined}
          tabIndex={-1}
          type="button"
        >
          <ShortcutNumber value="0" />
          <span>{props.moreLabel ?? '...'}</span>
        </button>
      ) : null}
    </div>
  );
}
