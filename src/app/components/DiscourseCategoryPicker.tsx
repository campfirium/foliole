import { useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName, appInputFocusVisibleClassName } from '../../shared/ui';

import type { PublishFormState } from './discoursePublishDialogModel';
import { categoryParts, type Category } from './discoursePublishFieldUtils';
import { DiscourseShortcutGrid } from './DiscourseShortcutPicker';

const SHORTCUT_LIMIT = 9;

function ShortcutBadge(props: { index: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border/70 text-xs text-foreground/55">
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
  close: () => void;
  query: string;
  selectedCategoryId: string;
  selectCategory: (category: Category) => void;
  setQuery: (query: string) => void;
}) {
  const t = useTranslation();
  const visibleCategories = props.categories.filter((category) => category.name.toLowerCase().includes(props.query.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/10 px-5">
      <div className={appFloatingSurfaceClassName('popover', 'w-[min(860px,calc(100vw-40px))] overflow-hidden p-4')} role="listbox">
        <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-3">
          <input
            aria-label={t('desktop.discoursePublish.category')}
            autoFocus
            className="h-8 rounded-md border border-settings-control-border bg-settings-control px-2 text-ui-md text-foreground outline-none placeholder:text-foreground/42 focus:border-settings-control-border-hover focus:bg-settings-control-hover focus:ring-1 focus:ring-ring"
            onChange={(event) => props.setQuery(event.target.value)}
            placeholder=""
            value={props.query}
          />
          <button className="h-8 rounded-md px-2 text-sm text-foreground/62 hover:bg-settings-control-hover hover:text-foreground" onClick={props.close} type="button">
            {t('common.cancel')}
          </button>
        </div>
        <div className="app-scrollbar grid max-h-[min(420px,calc(100vh-180px))] grid-cols-2 gap-2 overflow-y-auto">
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
    </div>
  );
}

function CategoryShortcuts(props: {
  categories: Category[];
  selectedCategoryId: string;
  onMore: () => void;
  selectCategory: (category: Category) => void;
}) {
  return (
    <DiscourseShortcutGrid
      items={props.categories.map((category) => ({
        id: String(category.id),
        label: categoryParts(category).name,
        selected: String(category.id) === props.selectedCategoryId
      }))}
      onMore={props.onMore}
      onSelect={(item) => {
        const category = props.categories.find((entry) => String(entry.id) === item.id);
        if (category) props.selectCategory(category);
      }}
    />
  );
}

function categoryForShortcut(categories: Category[], key: string) {
  const shortcut = Number(key);
  return shortcut >= 1 && shortcut <= SHORTCUT_LIMIT ? categories[shortcut - 1] : null;
}

export function DiscourseCategoryPicker(props: {
  categories: Category[];
  form: PublishFormState;
  setForm: (form: PublishFormState) => void;
  showAll: boolean;
  toggleShowAll: () => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const selectedCategory = props.categories.find((category) => String(category.id) === props.form.categoryId);

  const selectCategory = (category: Category) => {
    props.setForm({ ...props.form, categoryId: String(category.id) });
    if (props.showAll) props.toggleShowAll();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const category = categoryForShortcut(props.categories, event.key);
    if (category) {
      event.preventDefault();
      selectCategory(category);
      return;
    }
    if (event.key === '0' && props.categories.length > SHORTCUT_LIMIT) {
      event.preventDefault();
      props.toggleShowAll();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.toggleShowAll();
    }
  };

  return (
    <div className="relative grid gap-2.5">
      <button
        aria-expanded={props.showAll}
        aria-haspopup="listbox"
        aria-label={t('desktop.discoursePublish.category')}
        autoFocus
        className={`flex h-10 w-full items-center justify-between rounded-md border border-settings-control-border bg-settings-control px-3 text-left text-ui-md text-foreground transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover ${appInputFocusVisibleClassName}`}
        onClick={props.toggleShowAll}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span className="min-w-0 truncate">{selectedCategory?.name ?? props.categories[0]?.name ?? t('desktop.discoursePublish.category.placeholder')}</span>
        <span className="ml-2 text-foreground/55">...</span>
      </button>
      <CategoryShortcuts categories={props.categories} onMore={props.toggleShowAll} selectCategory={selectCategory} selectedCategoryId={props.form.categoryId} />
      {props.showAll ? <CategoryPopover categories={props.categories} close={props.toggleShowAll} query={query} selectedCategoryId={props.form.categoryId} selectCategory={selectCategory} setQuery={setQuery} /> : null}
    </div>
  );
}
