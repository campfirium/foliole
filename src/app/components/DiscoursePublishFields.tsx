import type { ReactNode } from 'react';

import type { NativeDiscoursePublishCatalog } from '../../../lib/platform/nativeDiscoursePublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { DiscourseCategoryPicker } from './DiscourseCategoryPicker';
import type { PublishFormState } from './discoursePublishDialogModel';
import { byRecent, mergeRecentTags } from './discoursePublishFieldUtils';
import { DiscourseTagPicker } from './DiscourseTagPicker';

type CatalogState = { catalog: NativeDiscoursePublishCatalog | null; error: string | null; loading: boolean };

function FieldSection(props: { children: ReactNode; label: string }) {
  return (
    <section className="grid gap-1.5">
      <div className="text-sm text-foreground/68">{props.label}</div>
      {props.children}
    </section>
  );
}

export function DiscoursePublishFields(props: {
  catalog: CatalogState;
  form: PublishFormState;
  setForm: (form: PublishFormState) => void;
  showAllCategories: boolean;
  showAllTags: boolean;
  toggleShowAllCategories: () => void;
  toggleShowAllTags: () => void;
}) {
  const t = useTranslation();
  const catalog = props.catalog.catalog;
  const tags = byRecent(mergeRecentTags(catalog?.tags ?? [], catalog?.recent_tags ?? []), catalog?.recent_tags ?? [], (tag) => tag.name);
  return (
    <div className="mt-5 grid gap-4">
      <FieldSection label={t('desktop.discoursePublish.category')}>
        <DiscourseCategoryPicker categories={catalog?.categories ?? []} form={props.form} setForm={props.setForm} showAll={props.showAllCategories} toggleShowAll={props.toggleShowAllCategories} />
      </FieldSection>
      <FieldSection label={t('desktop.discoursePublish.tags')}>
        <DiscourseTagPicker form={props.form} setForm={props.setForm} showAll={props.showAllTags} tags={tags} toggleShowAll={props.toggleShowAllTags} />
      </FieldSection>
    </div>
  );
}

export type { CatalogState };
