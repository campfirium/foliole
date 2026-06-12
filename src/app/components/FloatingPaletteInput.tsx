import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { appFloatingInputClassName } from '../../shared/ui';

import { handleFloatingPaletteInputKeyDown } from './floatingPaletteKeyboard';

interface FloatingPaletteInputProps {
  inputLabel: string;
  onClose: () => void;
  onCompositionChange?: (isComposing: boolean) => void;
  onQueryChange: (value: string) => void;
  onRunActive: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  placeholder: string;
  query: string;
  totalItems: number;
}

export function FloatingPaletteInput(props: FloatingPaletteInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      aria-label={props.inputLabel}
      className={appFloatingInputClassName()}
      onChange={(event) => props.onQueryChange(event.target.value)}
      onCompositionEnd={(event) => {
        props.onCompositionChange?.(false);
        props.onQueryChange(event.currentTarget.value);
      }}
      onCompositionStart={() => props.onCompositionChange?.(true)}
      onKeyDown={(event) =>
        handleFloatingPaletteInputKeyDown(
          event,
          props.totalItems,
          props.onClose,
          props.onRunActive,
          props.onSetActiveIndex
        )
      }
      placeholder={props.placeholder}
      ref={inputRef}
      type="text"
      value={props.query}
    />
  );
}
