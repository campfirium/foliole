import { ArrowDownToLine, ArrowUpToLine, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { ReadingBottomSheet } from './CompanionReadingSheets';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';
import {
  buildTopicSearchDecorations,
  buildTopicSearchMatches,
  resolveTopicSearchStatusLabel
} from '@/features/editor/model/documentTopicSearch';
import { AppIconButton, AppInput } from '@/shared/ui';

interface CompanionDocumentSearchSheetProps {
  content: string;
  editor: EditorAdapter | null;
  onOpenChange(open: boolean): void;
  open: boolean;
}

function useCompanionDocumentSearchState(props: CompanionDocumentSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => buildTopicSearchMatches(props.content, query), [props.content, query]);

  useEffect(() => {
    if (props.open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [props.open]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [props.content, query]);

  useEffect(() => {
    if (!props.open) {
      props.editor?.setSearchDecorations(null);
      return;
    }
    props.editor?.setSearchDecorations(buildTopicSearchDecorations(query, matches, currentIndex));
    const activeMatch = matches[Math.min(currentIndex, Math.max(0, matches.length - 1))];
    if (activeMatch) {
      if (props.editor?.revealSelectionCentered) {
        props.editor.revealSelectionCentered(activeMatch, { preserveFocus: true });
      } else {
        props.editor?.revealSelection(activeMatch, { preserveFocus: true });
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [currentIndex, matches, props.editor, props.open, query]);

  useEffect(() => () => props.editor?.setSearchDecorations(null), [props.editor]);

  return { currentIndex, inputRef, matches, query, setCurrentIndex, setQuery };
}

function DocumentSearchControls(props: {
  inputRef: RefObject<HTMLInputElement>;
  hasMatches: boolean;
  onClose(): void;
  onQueryChange(value: string): void;
  onStep(direction: 1 | -1): void;
  query: string;
}) {
  const t = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-md border border-companion-divider bg-companion-content px-2">
      <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-companion-text-secondary" />
      <AppInput
        aria-label={t('companion.reading.find')}
        className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm focus-visible:ring-0"
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && props.hasMatches) {
            event.preventDefault();
            props.onStep(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder={t('companion.search.documentPlaceholder')}
        ref={props.inputRef}
        value={props.query}
      />
      <AppIconButton className="size-9" disabled={!props.hasMatches} icon={<ArrowUpToLine aria-hidden="true" size={16} />} label={t('companion.search.previousMatch')} onClick={() => props.onStep(-1)} />
      <AppIconButton className="size-9" disabled={!props.hasMatches} icon={<ArrowDownToLine aria-hidden="true" size={16} />} label={t('companion.search.nextMatch')} onClick={() => props.onStep(1)} />
      <AppIconButton className="size-9" icon={<X aria-hidden="true" size={16} />} label={t('companion.search.closeDocumentSearch')} onClick={props.onClose} />
    </div>
  );
}

export function CompanionDocumentSearchSheet(props: CompanionDocumentSearchSheetProps) {
  const t = useTranslation();
  const state = useCompanionDocumentSearchState(props);
  const hasMatches = state.matches.length > 0;
  const statusLabel = resolveTopicSearchStatusLabel(state.query, state.currentIndex, state.matches.length);

  function step(direction: 1 | -1) {
    if (!state.matches.length) {
      return;
    }
    state.setCurrentIndex((value) => (value + direction + state.matches.length) % state.matches.length);
  }

  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.find')}>
      <div className="border-t border-companion-divider pt-4">
        <DocumentSearchControls
          inputRef={state.inputRef}
          hasMatches={hasMatches}
          onClose={() => props.onOpenChange(false)}
          onQueryChange={state.setQuery}
          onStep={step}
          query={state.query}
        />
        <p aria-live="polite" className="min-h-6 px-1 pt-2 text-xs text-companion-text-secondary" data-testid="companion-document-search-status">
          {statusLabel}
        </p>
      </div>
    </ReadingBottomSheet>
  );
}
