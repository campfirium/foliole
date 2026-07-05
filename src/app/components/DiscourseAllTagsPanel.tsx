import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import type { Tag } from './discoursePublishFieldUtils';

function CreateTagHint(props: { canCreate: boolean; createTag: () => void; query: string }) {
  if (props.canCreate) {
    return (
      <button className="rounded-md border border-border-strong bg-settings-control px-3 py-2 text-left text-ui-md text-foreground" onClick={props.createTag} type="button">
        Enter + {props.query}
      </button>
    );
  }
  return <div className="h-10" />;
}

export function DiscourseAllTagsPanel(props: {
  addTag: (tag: string) => void;
  close: () => void;
  query: string;
  selected: Set<string>;
  setQuery: (query: string) => void;
  tags: Tag[];
}) {
  const t = useTranslation();
  const query = props.query.trim();
  const canCreate = query.length > 0 && !props.selected.has(query) && !props.tags.some((tag) => tag.name === query);
  const createTag = () => {
    if (!query) return;
    props.addTag(query);
    props.setQuery('');
  };
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/10 px-5">
      <div className={appFloatingSurfaceClassName('popover', 'grid h-[min(680px,calc(100vh-56px))] w-[min(1180px,calc(100vw-40px))] grid-rows-[auto_auto_1fr] overflow-hidden p-7')}>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4">
          <input
            aria-label={t('desktop.discoursePublish.tags')}
            autoFocus
            className="h-10 rounded-md border border-settings-control-border bg-settings-control px-3 text-ui-md text-foreground outline-none placeholder:text-foreground/42 focus:border-settings-control-border-hover focus:bg-settings-control-hover focus:ring-1 focus:ring-ring"
            onChange={(event) => props.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              createTag();
            }}
            placeholder=""
            spellCheck={false}
            value={props.query}
          />
          <button className="h-10 rounded-md px-3 text-ui-md text-foreground/62 hover:bg-settings-control-hover hover:text-foreground" onClick={props.close} type="button">
            {t('common.cancel')}
          </button>
        </div>
        <div className="min-h-14 py-3">
          <CreateTagHint canCreate={canCreate} createTag={createTag} query={query} />
        </div>
        <div className="app-scrollbar min-h-0 overflow-y-auto pr-1">
          <div className="flex flex-wrap content-start gap-2.5">
            {props.tags.map((tag) => (
              <button className={`h-10 max-w-64 rounded-md border px-3.5 text-left text-ui-md transition-colors ${props.selected.has(tag.name) ? 'border-border-strong bg-settings-control text-foreground' : 'border-settings-control-border bg-settings-control text-foreground/72 hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground'}`} key={`all-${tag.id}`} onClick={() => props.addTag(tag.name)} type="button">
                <span className="block truncate">{tag.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
