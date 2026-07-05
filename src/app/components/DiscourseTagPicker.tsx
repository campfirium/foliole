import { useEffect, useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { DiscourseAllTagsPanel } from './DiscourseAllTagsPanel';
import { toTags, type PublishFormState } from './discoursePublishDialogModel';
import { addMissingTag, removeTag, type Tag } from './discoursePublishFieldUtils';
import { DiscourseShortcutGrid } from './DiscourseShortcutPicker';

const SHORTCUT_LIMIT = 9;

function TagChip(props: { remove: () => void; tag: string }) {
  return (
    <span className="inline-flex max-w-[18ch] items-center gap-1 rounded-md bg-settings-control-active px-2 py-1 text-sm text-foreground/76">
      <span className="truncate">{props.tag}</span>
      <button className="rounded-full px-1 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground" onClick={props.remove} tabIndex={-1} type="button">x</button>
    </span>
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
    <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-settings-control-border bg-settings-control px-2 py-1 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover focus-within:border-settings-control-border-hover focus-within:bg-settings-control-hover focus-within:ring-1 focus-within:ring-ring">
      {props.selectedTags.map((tag) => <TagChip key={tag} remove={() => props.removeTag(tag)} tag={tag} />)}
      <input
        aria-label={t('desktop.discoursePublish.tags')}
        className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-ui-md text-foreground outline-none placeholder:text-foreground/42"
        onBlur={props.commitDraft}
        onChange={(event) => props.setDraft(event.target.value)}
        onKeyDown={props.handleKeyDown}
        placeholder={props.selectedTags.length ? '' : t('desktop.discoursePublish.tags')}
        spellCheck={false}
        value={props.draft}
      />
    </div>
  );
}

function getShortcutTags(args: { draftQuery: string; selected: Set<string>; tags: Tag[] }) {
  const tags = args.draftQuery
    ? args.tags.filter((tag) => !args.selected.has(tag.name) && tag.name.toLowerCase().includes(args.draftQuery))
    : args.tags;
  return tags.slice(0, SHORTCUT_LIMIT);
}

function toShortcutItems(tags: Tag[], selected: Set<string>) {
  return tags.map((tag) => ({ id: tag.id, label: tag.name, selected: selected.has(tag.name) }));
}

function TagShortcutGrid(props: {
  draftQuery: string;
  draftValue: string;
  onCreate: () => void;
  onMore: () => void;
  onSelect: (label: string) => void;
  selected: Set<string>;
  shortcutTags: Tag[];
  tags: Tag[];
}) {
  if (props.draftQuery && props.shortcutTags.length === 0) {
    return (
      <div className="grid min-h-[5rem] grid-cols-5 gap-2">
        <button className="inline-flex h-9 min-w-0 items-center justify-start rounded-md border border-border-strong bg-settings-control px-3 text-ui-md text-foreground" onMouseDown={(event) => event.preventDefault()} onClick={props.onCreate} tabIndex={-1} type="button">
          Enter + {props.draftValue.trim()}
        </button>
      </div>
    );
  }
  return (
    <DiscourseShortcutGrid
      items={toShortcutItems(props.draftQuery ? props.shortcutTags : props.tags, props.selected)}
      onMore={props.onMore}
      onSelect={(item) => props.onSelect(item.label)}
      preventMouseDownDefault={Boolean(props.draftQuery)}
    />
  );
}

function handleTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>, args: {
  commitDraft: () => void;
  draftQuery: string;
  openAll: () => void;
  shortcutTags: Tag[];
  tagCount: number;
  toggleTag: (tag: string) => void;
  completeTag: (tag: string) => void;
}) {
  if (!args.draftQuery && event.key === '0' && args.tagCount > SHORTCUT_LIMIT) {
    event.preventDefault();
    args.openAll();
    return;
  }
  const shortcut = Number(event.key);
  if (shortcut >= 1 && shortcut <= SHORTCUT_LIMIT) {
    const tag = args.shortcutTags[shortcut - 1];
    if (tag) {
      event.preventDefault();
      if (args.draftQuery) args.completeTag(tag.name);
      else args.toggleTag(tag.name);
    }
    return;
  }
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    args.commitDraft();
  }
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
  const panelTags = props.tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const draftQuery = draft.trim().toLowerCase();
  const shortcutTags = getShortcutTags({ draftQuery, selected, tags: props.tags });
  const setTags = (tags: string) => props.setForm({ ...props.form, tags });
  const addTag = (tag: string) => setTags(addMissingTag(props.form.tags, tag));
  const toggleTag = (tag: string) => setTags(selected.has(tag) ? removeTag(props.form.tags, tag) : addMissingTag(props.form.tags, tag));
  const completeTag = (tag: string) => {
    addTag(tag);
    setDraft('');
  };

  useEffect(() => {
    if (!props.showAll) setQuery('');
  }, [props.showAll]);

  const commitDraft = () => {
    const tag = draft.trim();
    if (!tag) return;
    addTag(tag);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) =>
    handleTagInputKeyDown(event, { commitDraft, draftQuery, openAll: props.toggleShowAll, shortcutTags, tagCount: props.tags.length, toggleTag, completeTag });

  return (
    <div className="relative grid gap-2.5">
      <SelectedTagInput commitDraft={commitDraft} draft={draft} handleKeyDown={handleKeyDown} removeTag={(tag) => setTags(removeTag(props.form.tags, tag))} selectedTags={selectedTags} setDraft={setDraft} />
      <TagShortcutGrid
        draftQuery={draftQuery}
        draftValue={draft}
        onCreate={commitDraft}
        onMore={props.toggleShowAll}
        onSelect={(label) => {
          if (draftQuery) {
            completeTag(label);
            return;
          }
          toggleTag(label);
        }}
        selected={selected}
        shortcutTags={shortcutTags}
        tags={props.tags}
      />
      {props.showAll ? <DiscourseAllTagsPanel addTag={addTag} close={props.toggleShowAll} query={query} selected={selected} setQuery={setQuery} tags={panelTags} /> : null}
    </div>
  );
}
