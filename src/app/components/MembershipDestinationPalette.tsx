import { FolderPlus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  AppButton,
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';

interface MembershipPaletteCopy {
  title: string;
  input: string;
  placeholder: string;
  results: string;
  empty: string;
  noResults: string;
  create?: string;
}

interface MembershipTarget {
  id: string;
  title: string;
}

function MembershipResults(props: {
  activeIndex: number;
  copy: MembershipPaletteCopy;
  onCreate?: () => void;
  showCreateWithResults?: boolean;
  onSelect: (targetId: string) => void;
  query: string;
  targets: readonly MembershipTarget[];
}) {
  if (!props.targets.length) {
    return (
      <ul aria-label={props.copy.results} className={appFloatingListClassName()}>
        <li className={appFloatingEmptyStateClassName()}>
          <span>
            {props.query.trim()
              ? props.copy.noResults
              : props.copy.empty}
          </span>
          {(!props.query.trim() || props.showCreateWithResults) && props.onCreate ? (
            <AppButton onClick={props.onCreate} size="sm" variant="subtle">
              {props.copy.create}
            </AppButton>
          ) : null}
        </li>
      </ul>
    );
  }
  return (
    <ul aria-label={props.copy.results} className={appFloatingListClassName()}>
      {props.targets.map((target, index) => (
        <li key={target.id}>
          <button
            className={appFloatingItemClassName('flex items-center gap-3')}
            data-active={index === props.activeIndex}
            onClick={() => props.onSelect(target.id)}
            type="button"
          >
            <FolderPlus aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{target.title}</span>
          </button>
        </li>
      ))}
      {props.onCreate && props.showCreateWithResults ? (
        <li className="px-3 py-2">
          <AppButton onClick={props.onCreate} size="sm" variant="subtle">{props.copy.create}</AppButton>
        </li>
      ) : null}
    </ul>
  );
}

export function MembershipDestinationPalette(props: {
  copy: MembershipPaletteCopy;
  onClose: () => void;
  onCreate?: () => void;
  onSelect: (id: string) => void;
  targets: readonly MembershipTarget[];
  showCreateWithResults?: boolean;
}) {
  const focusTrap = useFloatingDialogFocusTrap(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const targets = useMemo(() => props.targets.filter((target) => target.title.toLocaleLowerCase().includes(normalizedQuery)),
    [props.targets, normalizedQuery]);
  const changeQuery = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
  };
  useFloatingPaletteEscape(true, props.onClose);
  const selectActiveTarget = () => {
    const target = targets[activeIndex];
    if (target) props.onSelect(target.id);
  };

  return (
    <div
      aria-label={props.copy.title}
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={props.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={focusTrap.handleKeyDown}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel={props.copy.input}
          onClose={props.onClose}
          onQueryChange={changeQuery}
          onRunActive={selectActiveTarget}
          onSetActiveIndex={setActiveIndex}
          placeholder={props.copy.placeholder}
          query={query}
          totalItems={targets.length}
        />
        <MembershipResults
          activeIndex={activeIndex}
          onSelect={props.onSelect}
          copy={props.copy}
          {...(props.onCreate ? { onCreate: props.onCreate } : {})}
          {...(props.showCreateWithResults ? { showCreateWithResults: true } : {})}
          query={query}
          targets={targets}
        />
      </div>
    </div>
  );
}
