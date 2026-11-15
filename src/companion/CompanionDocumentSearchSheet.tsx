import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import {
  buildTopicSearchDecorations,
  buildTopicSearchMatches,
  resolveTopicSearchStatusLabel
} from '@/features/editor/model/documentTopicSearch';
import { AppIconButton, AppInput } from '@/shared/ui';

interface CompanionDocumentSearchSessionProps {
  content: string;
  editor: EditorAdapter | null;
  onOpenChange(open: boolean): void;
  onKeepMatch?: ((match: EditorSelection) => void) | undefined;
}

type SubmittedSearch = { query: string; index: number };

function useDocumentSearch({ content, editor }: CompanionDocumentSearchSessionProps) {
  const [submitted, setSubmitted] = useState<SubmittedSearch | null>(null);
  const query = submitted?.query ?? '';
  const matches = useMemo(() => buildTopicSearchMatches(content, query), [content, query]);
  const index = Math.min(submitted?.index ?? 0, Math.max(0, matches.length - 1));
  const activeMatch = matches[index];

  useEffect(() => {
    if (!submitted || !editor) return;
    editor.setSearchDecorations(buildTopicSearchDecorations(submitted.query, matches, index));
    if (activeMatch) {
      if (editor.revealSelectionCentered) {
        editor.revealSelectionCentered(activeMatch, { preserveFocus: true });
      } else {
        editor.revealSelection(activeMatch, { preserveFocus: true });
      }
    }
  }, [activeMatch, editor, index, matches, submitted]);

  useEffect(() => () => editor?.setSearchDecorations(null), [editor]);

  function step(direction: 1 | -1) {
    if (!submitted || !matches.length) return;
    const nextIndex = (index + direction + matches.length) % matches.length;
    setSubmitted({ query, index: nextIndex });
  }

  return {
    activeMatch, index, query, step, total: matches.length,
    submit: (text: string) => setSubmitted({ query: text, index: 0 })
  };
}

function DocumentSearchResults(props: {
  disabled: boolean;
  onStep(direction: 1 | -1): void;
  status: string;
}) {
  const t = useTranslation();
  return (
    <>
      <output className="min-w-9 shrink-0 text-center text-xs tabular-nums text-companion-text-secondary"
        data-testid="companion-document-search-status">
        {props.status}
      </output>
      <AppIconButton className="size-11" disabled={props.disabled}
        icon={<ChevronUp aria-hidden="true" size={18} />}
        label={t('companion.search.previousMatch')} onClick={() => props.onStep(-1)} />
      <AppIconButton className="size-11" disabled={props.disabled}
        icon={<ChevronDown aria-hidden="true" size={18} />}
        label={t('companion.search.nextMatch')} onClick={() => props.onStep(1)} />
    </>
  );
}

function DocumentSearchSession(props: CompanionDocumentSearchSessionProps) {
  const t = useTranslation();
  const search = useDocumentSearch(props);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  function leaveInput() {
    if (!search.query) return;
    setDraft(search.query);
    setEditing(false);
  }

  function submit() {
    const query = draft.trim();
    if (!query) return;
    inputRef.current?.blur();
    setDraft(query);
    search.submit(query);
    setEditing(false);
  }

  function close() {
    if (search.activeMatch && props.editor) props.onKeepMatch?.(search.activeMatch);
    props.onOpenChange(false);
  }

  return (
    <form
      aria-label={t('companion.reading.find')}
      className={`companion-document-search fixed inset-x-3 bottom-3 z-floating mx-auto flex max-w-[calc(100%_-_1.5rem)] items-center gap-1 rounded-lg supports-[bottom:max(0px)]:bottom-[max(env(safe-area-inset-bottom),12px)] ${editing ? 'w-[min(24rem,calc(100%_-_1.5rem))]' : 'w-max border border-companion-divider bg-companion-base p-1 shadow-popover'}`}
      onSubmit={(event) => { event.preventDefault(); submit(); }}
      onKeyDown={(event) => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) close(); }}
      role="search"
    >
      {editing ? <Search aria-hidden="true" className="pointer-events-none absolute left-4 text-companion-text-secondary" size={18} /> : (
        <AppIconButton className="size-11" icon={<Check aria-hidden="true" size={18} />}
          label={t('companion.search.closeDocumentSearch')} onClick={close} />
      )}
      <AppInput aria-label={t('companion.reading.find')}
        className={`companion-document-search-input h-12 min-w-0 truncate border-companion-divider bg-companion-content text-sm focus-visible:ring-0 ${editing ? 'w-full rounded-lg px-10 shadow-popover' : 'w-24 px-2'}`}
        enterKeyHint="search" placeholder={t('companion.search.documentPlaceholder')} ref={inputRef}
        onBlur={leaveInput} onChange={(event) => setDraft(event.target.value)} onFocus={() => setEditing(true)}
        value={draft}
      />
      {!editing && <DocumentSearchResults disabled={!search.total} onStep={search.step}
        status={resolveTopicSearchStatusLabel(search.query, search.index, search.total, '0/0')} />}
    </form>
  );
}

export function CompanionDocumentSearchSheet(props: CompanionDocumentSearchSessionProps & { open: boolean }) {
  return props.open ? <DocumentSearchSession {...props} /> : null;
}
