import { ArrowDownToLine, ArrowUpToLine, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject, type SetStateAction } from 'react';

import type {
  EditorSearchDecorations,
  EditorSelection,
  EditorViewportMode
} from '../../features/editor/adapters/EditorAdapter';
import {
  buildTopicSearchDecorations,
  buildTopicSearchMatches,
  resolveTopicSearchStatusLabel
} from '../../features/editor/model/documentTopicSearch';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, appFloatingToolbarClassName, AppInput } from '../../shared/ui';
import { useCommandShortcutState } from '../hooks/reviewHotkeysState';

import { useDocumentTopicSearchActivation } from './useDocumentTopicSearchActivation';

interface DocumentTopicSearchToolbarProps {
  activeNode: Node | undefined;
  activeNodeId: string | null;
  editorContent: string;
  onRevealDocumentSelection: (selection: EditorSelection, targetViewportMode?: EditorViewportMode) => void;
  onUpdateSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => void;
}

interface TopicSearchState {
  close: () => void;
  currentIndex: number;
  hasMatches: boolean;
  inputRef: RefObject<HTMLInputElement>;
  isOpen: boolean;
  matchCount: number;
  query: string;
  setQuery: (value: string) => void;
  step: (direction: 1 | -1) => void;
}

function refocusTopicSearchInput(inputRef: RefObject<HTMLInputElement>) {
  requestAnimationFrame(() => {
    inputRef.current?.focus();
  });
}

function canSearchTopic(activeNode: Node | undefined, editorDisplayMode: 'preview' | 'source') {
  return Boolean(activeNode && activeNode.kind === 'topic' && !activeNode.anchorLink && editorDisplayMode === 'preview');
}

function handleSearchInputKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
  hasMatches: boolean,
  onNext: () => void,
  onPrevious: () => void,
  onClose: () => void
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Enter' || !hasMatches) {
    return;
  }
  event.preventDefault();
  if (event.shiftKey) {
    onPrevious();
    return;
  }
  onNext();
}

function useTopicSearchState(args: DocumentTopicSearchToolbarProps): TopicSearchState {
  const { editorDisplayMode } = useAppearanceSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hotkeys = useCommandShortcutState([APP_COMMAND_IDS.findInTopic]);
  const findShortcut = hotkeys.shortcutMap[APP_COMMAND_IDS.findInTopic];
  const isSearchAvailable = canSearchTopic(args.activeNode, editorDisplayMode);
  const matches = useMemo(() => buildTopicSearchMatches(args.editorContent, query), [args.editorContent, query]);

  useResetTopicSearchState(args.activeNodeId, isSearchAvailable, setCurrentIndex, setIsOpen, setQueryState);
  useRevealTopicSearchMatch(currentIndex, inputRef, isOpen, matches, args.onRevealDocumentSelection, setCurrentIndex);
  useTopicSearchDecorations(query, matches, currentIndex, isOpen, args.onUpdateSearchDecorations);
  useFocusTopicSearchInput(focusRequestId, inputRef);
  useDocumentTopicSearchActivation(findShortcut, isSearchAvailable, setFocusRequestId, setIsOpen);

  return {
    close: () => setIsOpen(false),
    currentIndex,
    hasMatches: matches.length > 0,
    inputRef,
    isOpen: isOpen && isSearchAvailable,
    matchCount: matches.length,
    query,
    setQuery: (value: string) => {
      setCurrentIndex(0);
      setQueryState(value);
    },
    step: (direction: 1 | -1) => {
      if (!matches.length) {
        return;
      }
      setCurrentIndex((value) => (value + direction + matches.length) % matches.length);
      refocusTopicSearchInput(inputRef);
    }
  };
}

function useResetTopicSearchState(
  activeNodeId: string | null,
  isSearchAvailable: boolean,
  setCurrentIndex: Dispatch<SetStateAction<number>>,
  setIsOpen: Dispatch<SetStateAction<boolean>>,
  setQuery: Dispatch<SetStateAction<string>>
) {
  useEffect(() => {
    setIsOpen(false);
    setQuery('');
    setCurrentIndex(0);
  }, [activeNodeId, setCurrentIndex, setIsOpen, setQuery]);

  useEffect(() => {
    if (isSearchAvailable) {
      return;
    }
    setIsOpen(false);
    setQuery('');
    setCurrentIndex(0);
  }, [isSearchAvailable, setCurrentIndex, setIsOpen, setQuery]);
}

function useRevealTopicSearchMatch(
  currentIndex: number,
  inputRef: RefObject<HTMLInputElement>,
  isOpen: boolean,
  matches: EditorSelection[],
  onRevealDocumentSelection: (selection: EditorSelection, targetViewportMode?: EditorViewportMode) => void,
  setCurrentIndex: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const nextIndex = matches.length ? Math.min(currentIndex, matches.length - 1) : 0;
    if (nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
      return;
    }
    const activeMatch = matches[nextIndex];
    if (activeMatch) {
      onRevealDocumentSelection(activeMatch, 'center');
      refocusTopicSearchInput(inputRef);
    }
  }, [currentIndex, inputRef, isOpen, matches, onRevealDocumentSelection, setCurrentIndex]);
}

function useTopicSearchDecorations(
  query: string,
  matches: EditorSelection[],
  currentIndex: number,
  isOpen: boolean,
  onUpdateSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => void
) {
  useEffect(() => {
    onUpdateSearchDecorations(isOpen ? buildTopicSearchDecorations(query, matches, currentIndex) : null);
  }, [currentIndex, isOpen, matches, onUpdateSearchDecorations, query]);

  useEffect(() => () => onUpdateSearchDecorations(null), [onUpdateSearchDecorations]);
}

function useFocusTopicSearchInput(focusRequestId: number, inputRef: RefObject<HTMLInputElement>) {
  useEffect(() => {
    if (!focusRequestId) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequestId, inputRef]);
}

function TopicSearchPanel(state: TopicSearchState) {
  const t = useTranslation();
  const statusLabel = resolveTopicSearchStatusLabel(
    state.query,
    state.currentIndex,
    state.matchCount,
    t('desktop.topicSearch.noMatches')
  );
  const handleToolbarMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  return (
    <div className="sticky top-0 z-surface-overlay h-0 w-full px-4 pt-3 pointer-events-none" data-testid="topic-search-toolbar">
      <div className={appFloatingToolbarClassName()}>
        <div className="flex items-center gap-1">
          <Search aria-hidden="true" className="ml-1 text-foreground/55" size={15} strokeWidth={2.1} />
          <AppInput
            aria-label={t('desktop.topicSearch.input')}
            className="h-8 w-40 border-transparent bg-transparent px-2 text-xs focus-visible:ring-0"
            onChange={(event) => state.setQuery(event.target.value)}
            onKeyDown={(event) => handleSearchInputKeyDown(event, state.hasMatches, () => state.step(1), () => state.step(-1), state.close)}
            placeholder={t('desktop.topicSearch.placeholder')}
            ref={state.inputRef}
            type="text"
            value={state.query}
          />
          <AppIconButton className="size-8" disabled={!state.hasMatches} icon={<ArrowUpToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label={t('desktop.topicSearch.previous')} onClick={() => state.step(-1)} onMouseDown={handleToolbarMouseDown} />
          <AppIconButton className="size-8" disabled={!state.hasMatches} icon={<ArrowDownToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label={t('desktop.topicSearch.next')} onClick={() => state.step(1)} onMouseDown={handleToolbarMouseDown} />
          <AppIconButton className="size-8" icon={<X aria-hidden="true" size={15} strokeWidth={2.1} />} label={t('desktop.topicSearch.close')} onClick={state.close} onMouseDown={handleToolbarMouseDown} />
        </div>
        <p aria-live="polite" className="min-w-16 text-center text-xs text-foreground/70" data-testid="topic-search-status">
          {statusLabel}
        </p>
      </div>
    </div>
  );
}

export function DocumentTopicSearchToolbar(props: DocumentTopicSearchToolbarProps) {
  const state = useTopicSearchState(props);
  if (!state.isOpen) {
    return null;
  }
  return <TopicSearchPanel {...state} />;
}
