import type { ReactNode } from 'react';

import type {
  ReadwiseAutoImportCategory,
  ReadwiseAutoImportPolicy,
  ReadwiseAutoImportPolicyField,
  ReadwiseImportDestination
} from '../../../lib/core/import/readwiseAutoImportPolicy';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppInput,
  SettingsChoiceMatrix,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../shared/ui';

type PolicyField = ReadwiseAutoImportPolicyField;

const API_ROWS = [
  ['article', 'desktop.readwise.behavior.article.title'],
  ['email', 'desktop.readwise.behavior.email.title'],
  ['rss', 'desktop.readwise.behavior.rss.title'],
  ['pdf', 'desktop.readwise.behavior.pdf.title'],
  ['epub', 'desktop.readwise.behavior.epub.title'],
  ['video', 'desktop.readwise.behavior.video.title'],
  ['tweet', 'desktop.readwise.behavior.tweet.title']
] as const;

const FOLDER_ROWS = [
  ['article', 'desktop.readwise.behavior.article.title', 'article'],
  ['epub', 'desktop.readwise.behavior.book.title', 'book']
] as const;

export function ReadwiseReaderImportBehavior(props: {
  disabled?: boolean;
  onChange: (field: PolicyField, value: ReadwiseImportDestination) => void;
  onChangeImportTag: (value: string) => void;
  policy: ReadwiseAutoImportPolicy;
  sourceMode: 'api' | 'folder';
}) {
  const t = useTranslation();
  const options: Array<{ label: string; value: ReadwiseImportDestination }> = [
    { label: t('desktop.readwise.destination.inbox'), value: 'inbox' },
    { label: t('desktop.readwise.destination.external'), value: 'external' },
    { label: t('desktop.readwise.destination.off'), value: 'off' }
  ];
  function control(field: PolicyField, ariaLabel: string) {
    return (
      <select
        aria-label={ariaLabel}
        className={settingsFieldClassName()}
        disabled={props.disabled}
        onChange={(event) => props.onChange(field, event.target.value as ReadwiseImportDestination)}
        value={props.policy[field]}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  function row(
    category: ReadwiseAutoImportCategory,
    labelKey: typeof API_ROWS[number][1] | typeof FOLDER_ROWS[number][1],
    ariaCategory: ReadwiseAutoImportCategory | 'book' = category
  ) {
    const withHighlights = `${category}WithHighlights` as PolicyField;
    const withoutHighlights = `${category}WithoutHighlights` as PolicyField;
    return {
      cells: [
        control(withHighlights, t(`desktop.readwise.behavior.${ariaCategory}.withHighlights.aria`)),
        control(withoutHighlights, t(`desktop.readwise.behavior.${ariaCategory}.withoutHighlights.aria`))
      ] as [ReactNode, ReactNode],
      label: t(labelKey)
    };
  }
  const rows = props.sourceMode === 'api'
    ? API_ROWS.map(([category, label]) => row(category, label))
    : FOLDER_ROWS.map(([category, label, ariaCategory]) => row(category, label, ariaCategory));
  return <>
    <SettingsChoiceMatrix
      ariaLabel={t('desktop.readwise.section.behavior.aria')}
      columns={[
        t('desktop.readwise.behavior.withHighlights.title'),
        t('desktop.readwise.behavior.withoutHighlights.title')
      ]}
      rows={rows}
    />
    {props.sourceMode === 'api' ? <ReadwiseImportTagRow {...props} /> : null}
  </>;
}

function ReadwiseImportTagRow(props: {
  disabled?: boolean;
  onChangeImportTag: (value: string) => void;
  policy: ReadwiseAutoImportPolicy;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      description={t('desktop.readwise.behavior.importTag.description')}
      title={t('desktop.readwise.behavior.importTag.title')}
    >
      <SettingsControlSlot>
        <div className="flex min-w-0 items-stretch">
          <span aria-hidden="true" className="flex h-10 items-center rounded-l-md border border-r-0 border-settings-control-border bg-settings-control px-3 text-ui-input text-foreground/60">#</span>
          <AppInput
            aria-label={t('desktop.readwise.behavior.importTag.aria')}
            className="rounded-l-none"
            disabled={props.disabled}
            onChange={(event) => props.onChangeImportTag(event.target.value)}
            placeholder={t('desktop.readwise.behavior.importTag.placeholder')}
            value={props.policy.importTag}
          />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
