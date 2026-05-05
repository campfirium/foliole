import { useEffect, useState, type ChangeEvent, type CompositionEvent } from 'react';

export function usePdfSearchInputState(args: {
  onSearchQueryChange: (value: string) => void;
  onToolbarInteraction: () => void;
  searchQuery: string;
}) {
  const [draftQuery, setDraftQuery] = useState(args.searchQuery);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    setIsComposing(false);
    setDraftQuery(args.searchQuery);
  }, [args.searchQuery]);

  const commitSearchQuery = (value: string) => {
    args.onToolbarInteraction();
    args.onSearchQueryChange(value);
  };

  return {
    draftQuery,
    handleSearchInputChange: (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setDraftQuery(nextValue);
      const nativeEvent = event.nativeEvent;
      if (('isComposing' in nativeEvent && nativeEvent.isComposing) || isComposing) {
        return;
      }
      commitSearchQuery(nextValue);
    },
    handleSearchCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value;
      setIsComposing(false);
      setDraftQuery(nextValue);
      commitSearchQuery(nextValue);
    },
    handleSearchCompositionStart: () => {
      setIsComposing(true);
    }
  };
}
