import type { KeyboardEvent, ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { SearchAliasFilters } from './SearchAliasFilters';
import { SearchPaletteEnhancementPrompt } from './SearchPaletteEnhancementPrompt';
import { SearchPaletteIndexStatus } from './SearchPaletteIndexStatus';
import type { useSearchResults } from './searchPaletteSearchState';
import { WorkspaceResultHeader, workspaceResultInputClassName } from './WorkspaceResultPalette';

export function SearchPaletteInputAndFilters(props: {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onCompositionChange: (value: boolean) => void;
  onQueryChange: (value: string) => void;
  onRunActive: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  query: string;
  searchState: ReturnType<typeof useSearchResults>;
  totalItems: number;
}) {
  const t = useTranslation();
  return (
    <>
      <WorkspaceResultHeader>
        <FloatingPaletteInput
          className={workspaceResultInputClassName}
          inputLabel={t('desktop.search.input')}
          onClose={props.onClose}
          onCompositionChange={props.onCompositionChange}
          onQueryChange={props.onQueryChange}
          onRunActive={props.onRunActive}
          onSetActiveIndex={props.onSetActiveIndex}
          placeholder={t('desktop.search.placeholder')}
          query={props.query}
          totalItems={props.totalItems}
        />
        {props.children}
      </WorkspaceResultHeader>
      <SearchAliasFilters
        onSelect={props.searchState.selectSpelling}
        selectedSpelling={props.searchState.selectedSpelling}
        spellings={props.searchState.aliasSpellings}
      />
      <SearchPaletteEnhancementPrompt />
      <SearchPaletteIndexStatus isOpen={props.isOpen} />
    </>
  );
}
