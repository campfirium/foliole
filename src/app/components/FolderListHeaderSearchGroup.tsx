import type { ReactNode } from 'react';

import { definedProps } from '../../shared/lib/definedProps';

import { FolderListSearchBox } from './FolderListSearchBox';

export function FolderListHeaderSearchGroup(props: {
  searchQuery: string;
  searchAction?: ReactNode;
  searchAriaLabel?: string | undefined;
  searchDescription?: string | undefined;
  searchPlaceholder?: string | undefined;
  searchReadOnly?: boolean;
  searchResultLabel: string | null;
  onChangeSearchQuery: (value: string) => void;
}) {
  if (props.searchDescription) {
    return (
      <p className="min-w-[248px] max-w-full text-sm leading-6 text-foreground/58 max-[900px]:basis-full">
        {props.searchDescription}
      </p>
    );
  }

  return (
    <div className="flex max-w-full items-center gap-2 max-[900px]:basis-full">
      <div className="w-[248px] max-w-full shrink-0">
        <FolderListSearchBox
          onChangeSearchQuery={props.onChangeSearchQuery}
          {...definedProps({
            ariaLabel: props.searchAriaLabel,
            placeholder: props.searchPlaceholder,
            readOnly: props.searchReadOnly
          })}
          searchQuery={props.searchQuery}
          searchResultLabel={props.searchResultLabel}
        />
      </div>
      {props.searchAction}
    </div>
  );
}
