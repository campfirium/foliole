import { useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { toTags, type PublishFormState } from './discoursePublishDialogModel';
import { addMissingTag, removeTag, type Tag } from './discoursePublishFieldUtils';

const QUICK_TAG_LIMIT = 12;
const SHORTCUT_LIMIT = 9;

function QuickTagButton(props: {
  index?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs text-foreground/70 transition-colors hover:border-border-strong hover:bg-foreground/[0.04] hover:text-foreground" onClick={props.onClick} tabIndex={-1} type="button">
      {props.index !== undefined ? <span className="text-foreground/45">{props.index + 1}</span> : null}
      {props.label}
    </button>
  );
}

function TagChip(props: { remove: () => void; tag: string }) {
  return (
    <span className="inline-flex max-w-[18ch] items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground/78">
      <span className="truncate">{props.tag}</span>
      <button className="rounded-full px-1 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground" onClick={props.remove} tabIndex={-1} type="button">x</button>
    </span>
  );
}

function AllTagsPanel(props: {
  addTag: (tag: string) => void;
  query: string;
  selected: Set<string>;
  setQuery: (query: string) => void;
  tags: Tag[];
}) {
  const t = useTranslation();
  return (
    <div className={appFloatingSurfaceClassName('popover', 'absolute left-0 top-full z-floating mt-1 w-full overflow-hidden')}>
      <div className="border-b border-border/60 px-3 py-2">
        <input
          aria-label={t('desktop.discoursePublish.tags')}
          className="h-8 w-full border-0 bg-transparent text-ui-md text-foreground outline-none placeholder:text-foreground/42"
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder={t('desktop.discoursePublish.tags.all')}
          tabIndex={-1}
          value={props.query}
        />
      </div>
      <div className="app-scrollbar flex max-h-56 flex-wrap gap-1.5 overflow-y-auto p-2">
        {props.tags.map((tag) => (
          <button className={`rounded-full border px-2 py-1 text-xs transition-colors ${props.selected.has(tag.name) ? 'border-border-strong bg-foreground/[0.075] text-foreground' : 'border-border bg-background text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground'}`} key={`all-${tag.id}`} onClick={() => props.addTag(tag.name)} tabIndex={-1} type="button">
            {tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedTagInput(props: {
  commitDraft: () => void;
  draft: string;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  removeTag: (tag: string) => void;
  selectedTags: string[];
  setDraft: (draft: string) => void;
}) {
  const t = useTranslation();
  return (
    <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-settings-control-border bg-settings-control px-2 py-1 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover focus-within:border-settings-control-border-hover focus-within:bg-settings-control-hover focus-within:ring-1 focus-within:ring-ring">
      {props.selectedTags.map((tag) => <TagChip key={tag} remove={() => props.removeTag(tag)} tag={tag} />)}
      <input
        aria-label={t('desktop.discoursePublish.tags')}
        className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-ui-md text-foreground outline-none placeholder:text-foreground/42"
        onBlur={props.commitDraft}
        onChange={(event) => props.setDraft(event.target.value)}
        onKeyDown={props.handleKeyDown}
        placeholder={props.selectedTags.length ? '' : t('desktop.discoursePublish.tags')}
        value={props.draft}
      />
    </div>
  );
}

function QuickTags(props: {
  addTag: (tag: string) => void;
  tags: Tag[];
  toggleShowAll: () => void;
}) {
  const visibleTags = props.tags.slice(0, QUICK_TAG_LIMIT);
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleTags.map((tag, index) => (
        index < SHORTCUT_LIMIT
          ? <QuickTagButton index={index} key={tag.id} label={tag.name} onClick={() => props.addTag(tag.name)} />
          : <QuickTagButton key={tag.id} label={tag.name} onClick={() => props.addTag(tag.name)} />
      ))}
      {props.tags.length > QUICK_TAG_LIMIT ? <QuickTagButton label="0 ..." onClick={props.toggleShowAll} /> : null}
    </div>
  );
}

export function DiscourseTagPicker(props: {
  form: PublishFormState;
  setForm: (form: PublishFormState) => void;
  showAll: boolean;
  tags: Tag[];
  toggleShowAll: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const selectedTags = toTags(props.form.tags);
  const selected = new Set(selectedTags);
  const visibleTags = props.tags.filter((tag) => !selected.has(tag.name));
  const panelTags = props.tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const shortcutTags = props.tags.slice(0, SHORTCUT_LIMIT);
  const setTags = (tags: string) => props.setForm({ ...props.form, tags });
  const addTag = (tag: string) => setTags(addMissingTag(props.form.tags, tag));
  const commitDraft = () => {
    const tag = draft.trim();
    if (!tag) return;
    addTag(tag);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === '0') {
      event.preventDefault();
      props.toggleShowAll();
      return;
    }
    const shortcut = Number(event.key);
    if (shortcut >= 1 && shortcut <= SHORTCUT_LIMIT) {
      const tag = shortcutTags[shortcut - 1];
      if (tag) {
        event.preventDefault();
        addTag(tag.name);
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    }
  };

  return (
    <div className="relative grid gap-2">
      <SelectedTagInput commitDraft={commitDraft} draft={draft} handleKeyDown={handleKeyDown} removeTag={(tag) => setTags(removeTag(props.form.tags, tag))} selectedTags={selectedTags} setDraft={setDraft} />
      <QuickTags addTag={addTag} tags={visibleTags} toggleShowAll={props.toggleShowAll} />
      {props.showAll ? <AllTagsPanel addTag={addTag} query={query} selected={selected} setQuery={setQuery} tags={panelTags} /> : null}
    </div>
  );
}
