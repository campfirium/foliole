import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export interface SettingsFontComboboxProps {
  ariaLabel: string;
  description: string;
  label: string;
  loading: boolean;
  onChange: (value: string) => void;
  onOpen: () => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}

export function useSettingsFontCombobox(props: SettingsFontComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? props.options.filter((option) => option.label.toLocaleLowerCase().includes(needle)) : props.options;
  }, [props.options, query]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (value: string) => (props.onChange(value), setOpen(false));
  const show = () => {
    setOpen(true);
    setQuery('');
    setActiveIndex(Math.max(0, props.options.findIndex((option) => option.value === props.value)));
    props.onOpen();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => Math.max(0, Math.min(filtered.length - 1, index + delta)));
    }
    if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex].value);
    }
  };
  return { activeIndex, choose, filtered, inputRef, onInputKeyDown, open, query, rootRef, setActiveIndex, setOpen, setQuery, show };
}
