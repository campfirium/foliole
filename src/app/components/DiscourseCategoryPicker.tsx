import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName, appInputFocusVisibleClassName } from '../../shared/ui';

import type { PublishFormState } from './discoursePublishDialogModel';
import { categoryParts, orderedCategories, type Category } from './discoursePublishFieldUtils';

const SHORTCUT_LIMIT = 9;

function ShortcutBadge(props: { index: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-background text-xs text-foreground/55">
      {props.index + 1}
    </span>
  );
}

function CategoryOption(props: {
  category: Category;
  index: number;
  selected: boolean;
  selectCategory: (category: Category) => void;
}) {
  const parts = categoryParts(props.category);
  return (
    <button
      aria-selected={props.selected}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2 text-left text-ui-md text-foreground transition-colors hover:bg-foreground/[0.04] aria-selected:bg-foreground/[0.075]"
      onClick={() => props.selectCategory(props.category)}
      role="option"
      style={{ paddingLeft: `${8 + parts.depth * 18}px` }}
      tabIndex={-1}
      type="button"
    >
      {props.index < SHORTCUT_LIMIT ? <ShortcutBadge index={props.index} /> : <span className="size-5" />}
      <span className="min-w-0">
        <span className="block truncate font-medium">{parts.name}</span>
        {parts.path ? <span className="block truncate text-xs text-foreground/55">{parts.path}</span> : null}
      </span>
      <span className={props.selected ? 'text-foreground' : 'invisible'}>✓</span>
    </button>
  );
}

function CategoryPopover(props: {
  categories: Category[];
  query: string;
  selectedCategoryId: string;
  selectCategory: (category: Category) => void;
  setQuery: (query: string) => void;
}) {
  const t = useTranslation();
  const visibleCategories = props.categories.filter((category) => category.name.toLowerCase().includes(props.query.trim().toLowerCase()));
  return (
    <div className={appFloatingSurfaceClassName('popover', 'absolute left-0 top-full z-floating mt-1 w-full overflow-hidden')} role="listbox">
      <div className="border-b border-border/60 px-3 py-2">
        <input
          aria-label={t('desktop.discoursePublish.category')}
          className="h-8 w-full border-0 bg-transparent text-ui-md text-foreground outline-none placeholder:text-foreground/42"
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder={t('desktop.discoursePublish.category.placeholder')}
          value={props.query}
        />
      </div>
      <div className="app-scrollbar max-h-72 overflow-y-auto p-1.5">
        {visibleCategories.map((category, index) => (
          <CategoryOption
            category={category}
            index={index}
            key={category.id}
            selectCategory={props.selectCategory}
            selected={String(category.id) === props.selectedCategoryId}
          />
        ))}
      </div>
    </div>
  );
}

export function DiscourseCategoryPicker(props: {
  categories: Category[];
  form: PublishFormState;
  recentCategoryIds: number[];
  setForm: (form: PublishFormState) => void;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedCategory = props.categories.find((category) => String(category.id) === props.form.categoryId);
  const categories = useMemo(() => orderedCategories(props.categories, props.recentCategoryIds), [props.categories, props.recentCategoryIds]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const selectCategory = (category: Category) => {
    props.setForm({ ...props.form, categoryId: String(category.id) });
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const shortcut = Number(event.key);
    if (shortcut >= 1 && shortcut <= SHORTCUT_LIMIT) {
      const category = categories[shortcut - 1];
      if (category) {
        event.preventDefault();
        selectCategory(category);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('desktop.discoursePublish.category')}
        autoFocus
        className={`flex h-9 w-full items-center justify-between rounded-md border border-settings-control-border bg-settings-control px-3 text-left text-ui-md text-foreground transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover ${appInputFocusVisibleClassName}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span className="min-w-0 truncate">{selectedCategory?.name ?? t('desktop.discoursePublish.category.placeholder')}</span>
        <span className="ml-2 text-foreground/55">...</span>
      </button>
      {open ? (
        <CategoryPopover categories={categories} query={query} selectedCategoryId={props.form.categoryId} selectCategory={selectCategory} setQuery={setQuery} />
      ) : null}
    </div>
  );
}
