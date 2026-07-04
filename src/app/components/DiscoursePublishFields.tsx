import type { NativeDiscoursePublishCatalog } from '../../../lib/platform/nativeDiscoursePublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { DiscourseCategoryPicker } from './DiscourseCategoryPicker';
import type { PublishFormState } from './discoursePublishDialogModel';
import { byRecent, mergeRecentTags } from './discoursePublishFieldUtils';
import { DiscourseTagPicker } from './DiscourseTagPicker';

type CatalogState = { catalog: NativeDiscoursePublishCatalog | null; error: string | null; loading: boolean };

export function DiscoursePublishFields(props: {
  catalog: CatalogState;
  form: PublishFormState;
  setForm: (form: PublishFormState) => void;
  showAllTags: boolean;
  toggleShowAllTags: () => void;
}) {
  const t = useTranslation();
  const catalog = props.catalog.catalog;
  const tags = byRecent(mergeRecentTags(catalog?.tags ?? [], catalog?.recent_tags ?? []), catalog?.recent_tags ?? [], (tag) => tag.name);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[128px_minmax(0,1fr)]">
      <label className="text-sm leading-9 text-foreground/70">{t('desktop.discoursePublish.category')}</label>
      <DiscourseCategoryPicker categories={catalog?.categories ?? []} form={props.form} recentCategoryIds={catalog?.recent_category_ids ?? []} setForm={props.setForm} />
      <label className="text-sm leading-9 text-foreground/70">{t('desktop.discoursePublish.tags')}</label>
      <DiscourseTagPicker form={props.form} setForm={props.setForm} showAll={props.showAllTags} tags={tags} toggleShowAll={props.toggleShowAllTags} />
    </div>
  );
}

export type { CatalogState };
