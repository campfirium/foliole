import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import type {
  ReadwiseAutoImportCategory,
  ReadwiseAutoImportPolicy,
  ReadwiseAutoImportPolicyField,
  ReadwiseImportDestination
} from '../../../lib/core/import/readwiseAutoImportPolicy';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuTrigger,
  AppInput,
  SettingsChoiceMatrix,
  SettingsControlSlot,
  SettingsRow
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

function ImportDestinationControl(props: {
  ariaLabel: string;
  disabled: boolean | undefined;
  onChange: (value: ReadwiseImportDestination) => void;
  value: ReadwiseImportDestination;
}) {
  const t = useTranslation();
  const options: Array<{ label: string; value: ReadwiseImportDestination }> = [
    { label: t('desktop.readwise.destination.inbox'), value: 'inbox' },
    { label: t('desktop.readwise.destination.external'), value: 'external' },
    { label: t('desktop.readwise.destination.off'), value: 'off' }
  ];
  const selected = options.find((option) => option.value === props.value) ?? options[0]!;
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={props.ariaLabel}
          className="inline-flex h-8 w-full items-center justify-between gap-2 rounded-sm px-2 text-left text-ui-md text-foreground/78 transition-colors hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-settings-control-hover disabled:pointer-events-none disabled:opacity-45"
          disabled={props.disabled}
          role="combobox"
          type="button"
        >
          <span className="truncate">{selected.label}</span>
          <ChevronDown aria-hidden="true" className="shrink-0 text-foreground/55" size={15} strokeWidth={1.8} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="min-w-40">
        {options.map((option) => (
          <AppDropdownMenuCheckItem
            checked={option.value === props.value}
            key={option.value}
            onSelect={() => props.onChange(option.value)}
          >
            {option.label}
          </AppDropdownMenuCheckItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function ReadwiseReaderImportBehavior(props: {
  disabled?: boolean;
  onChange: (field: PolicyField, value: ReadwiseImportDestination) => void;
  onChangeImportTag: (value: string) => void;
  policy: ReadwiseAutoImportPolicy;
  sourceMode: 'api' | 'folder';
}) {
  const t = useTranslation();
  function control(field: PolicyField, ariaLabel: string) {
    return (
      <ImportDestinationControl
        ariaLabel={ariaLabel}
        disabled={props.disabled}
        onChange={(value) => props.onChange(field, value)}
        value={props.policy[field]}
      />
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
