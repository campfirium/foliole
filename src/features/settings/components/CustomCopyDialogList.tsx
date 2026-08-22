import { useRef, useState } from 'react';

import type { TranslationKey } from '../../../shared/localization/translations';
import { AppTextarea } from '../../../shared/ui';

interface CustomCopyRowProps {
  custom: string | undefined;
  editLabel: string;
  item: { key: TranslationKey; value: string };
  onChange: (key: TranslationKey, value: string | null) => void;
}

function CustomCopyRow({ custom, editLabel, item, onChange }: CustomCopyRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(custom ?? '');
  const cancelledRef = useRef(false);

  function startEditing() {
    cancelledRef.current = false;
    setDraft(custom ?? '');
    setEditing(true);
  }

  function commit() {
    if (cancelledRef.current) return;
    const value = draft.trim();
    onChange(item.key, value && value !== item.value ? value : null);
    setEditing(false);
  }

  return (
    <article className="py-4" data-custom-copy-key={item.key}>
      <div className="mb-2 truncate font-mono text-ui-xs text-foreground/38">{item.key}</div>
      <div className="grid grid-cols-2 items-start gap-dialog-column-gap">
        <div className="min-w-0 py-1 text-ui-md leading-5 text-foreground">{item.value}</div>
        <div className="min-w-0">
          {editing ? (
            <AppTextarea
              aria-label={editLabel}
              autoFocus
              className="min-h-16 resize-y text-ui-md leading-5"
              onBlur={commit}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelledRef.current = true;
                  setEditing(false);
                }
              }}
              value={draft}
            />
          ) : (
            <button
              aria-label={editLabel}
              className="min-h-8 w-full rounded-sm px-2 py-1 text-left text-ui-md leading-5 text-foreground transition-colors hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onDoubleClick={startEditing}
              onKeyDown={(event) => {
                if (event.key === 'Enter') startEditing();
              }}
              type="button"
            >
              {custom}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function CustomCopyDialogList(props: {
  getEditLabel: (key: TranslationKey) => string;
  items: Array<{ key: TranslationKey; value: string }>;
  overrides: Partial<Record<TranslationKey, string>>;
  onChange: (key: TranslationKey, value: string | null) => void;
}) {
  return (
    <div className="app-scrollbar min-h-0 flex-1 overflow-auto">
      {props.items.map((item) => (
        <CustomCopyRow custom={props.overrides[item.key]} editLabel={props.getEditLabel(item.key)} item={item} key={item.key} onChange={props.onChange} />
      ))}
    </div>
  );
}
