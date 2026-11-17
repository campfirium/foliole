import './WorkspaceFloatingPlacement.css';

import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import { WorkspaceResultHeader, workspaceResultInputClassName } from './WorkspaceResultPalette';
import { WorkspaceResultShortcutsFooter } from './WorkspaceResultShortcutsFooter';

interface Destination {
  id: string;
  title: string;
}

interface DestinationPaletteProps {
  action: string;
  dialogLabel: string;
  emptyLabel: string;
  findDestinations: (query: string) => readonly Destination[];
  noResultsLabel: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  placeholder: string;
}

export function WorkspaceDestinationPalette(props: DestinationPaletteProps) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const focusTrap = useFloatingDialogFocusTrap(true);
  useFloatingPaletteEscape(true, props.onClose);

  const results = props.findDestinations(query);
  const activeIndex = Math.max(0, Math.min(index, results.length - 1));
  const active = results[activeIndex];
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active?.id]);

  return (
    <div aria-label={props.dialogLabel} aria-modal="true" role="dialog"
      className={appFloatingOverlayClassName('pt-0')} onClick={props.onClose}>
      <div className={appFloatingSurfaceClassName('panel', 'workspace-destination-placement flex flex-col overflow-hidden')}
        ref={focusTrap.containerRef} onKeyDown={focusTrap.handleKeyDown} onClick={(event) => event.stopPropagation()}>
        <WorkspaceResultHeader icon={null}>
          <FloatingPaletteInput className={workspaceResultInputClassName}
            inputLabel={props.placeholder} onClose={props.onClose} onQueryChange={(value) => {
              setQuery(value);
              setIndex(0);
              if (list.current) list.current.scrollTop = 0;
            }}
            onRunActive={() => { if (active) props.onSelect(active.id); }}
            onSetActiveIndex={setIndex} placeholder={props.placeholder} query={query} totalItems={results.length} />
        </WorkspaceResultHeader>
        <DestinationResults ref={list} results={results} activeIndex={activeIndex} onSelect={props.onSelect}
          emptyLabel={query.trim() ? props.noResultsLabel : props.emptyLabel} />
        <WorkspaceResultShortcutsFooter
          showLabel={t('desktop.palette.destination.showShortcuts')}
          collapseLabel={t('desktop.palette.destination.hideShortcuts')}
          hints={[
            { keys: ['↑', '↓'], label: t('desktop.palette.destination.navigate') },
            { keys: ['↵'], label: props.action },
            { keys: ['Esc'], label: t('desktop.webLookup.cancel') }
          ]} />
      </div>
    </div>
  );
}

function DestinationResults(props: {
  ref: React.Ref<HTMLUListElement>;
  results: readonly Destination[];
  activeIndex: number;
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <ul className={appFloatingListClassName('min-h-0 max-h-[44vh]')} ref={props.ref}>
      {props.results.length === 0 ? <li className={appFloatingEmptyStateClassName()}>{props.emptyLabel}</li> :
        props.results.map((result, index) => (
          <li key={result.id}>
            <button type="button" className={appFloatingItemClassName('block truncate')}
              data-active={index === props.activeIndex} onClick={() => props.onSelect(result.id)}>
              {result.title}
            </button>
          </li>
        ))}
    </ul>
  );
}
