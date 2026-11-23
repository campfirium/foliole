import { useMemo } from 'react';

import {
  allocateAideAttachedContext,
  type AideAllocatedContextItem,
  type AideContextUnit
} from '../../../../../lib/core/assistant/aideAttachedContextAllocation';
import { buildAideAttachedContextCandidates } from '../../../../../lib/core/assistant/aideAttachedContextCandidates';
import type { AideAttachedContextSettings } from '../../../../../lib/core/assistant/aideAttachedContextSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
import {
  AIDE_CONTEXT_EXAMPLE_QUESTION,
  AIDE_CONTEXT_EXAMPLE_TITLE,
  createAideContextExampleSnapshot
} from '../../model/aideAttachedContextExample';

import { aideContextItemTitleKey } from './SettingsAideAttachedContextSection';

const EXAMPLE_CANDIDATES = buildAideAttachedContextCandidates(createAideContextExampleSnapshot());
const CURRENT_MARKER = ' (current)';

// Unit labels are written in English for the model; the preview shows them in the UI language.
const LABEL_KEYS: Record<string, string> = {
  After: 'after',
  Answer: 'answer',
  Before: 'before',
  'Current text': 'currentText',
  Dives: 'dives',
  Excerpt: 'excerpt',
  Folder: 'folder',
  Indexes: 'indexes',
  'Item answer': 'itemAnswer',
  'Item question': 'itemQuestion',
  Note: 'note',
  Question: 'question',
  'Source excerpt': 'sourceExcerpt'
};

export function SettingsAideAttachedContextPreview({ settings }: { settings: AideAttachedContextSettings }) {
  const t = useTranslation();
  const items = useMemo(() => allocateAideAttachedContext(EXAMPLE_CANDIDATES, settings), [settings]);
  return (
    <section
      aria-label={t('settings.aideDialog.context.preview.title')}
      className="relative min-h-[240px] overflow-hidden rounded-lg border border-foreground/12 bg-background"
    >
      <div className="absolute inset-0 overflow-auto overscroll-contain">
        <header className="sticky top-0 z-[1] border-b border-settings-divider/70 bg-background px-[18px] pb-2.5 pt-3">
          <h3 className="m-0 text-ui-md font-semibold leading-5 text-foreground">{t('settings.aideDialog.context.preview.title')}</h3>
          <p className="m-0 text-ui-sm leading-[18px] text-foreground/50">
            {t('settings.aideDialog.context.preview.caption', { title: AIDE_CONTEXT_EXAMPLE_TITLE })}
          </p>
        </header>
        <div className="pb-6 pt-1.5">
          <PreviewLabel>{t('settings.aideDialog.context.preview.question')}</PreviewLabel>
          <p className="mx-[18px] mb-3 mt-0 text-ui-md leading-[22px]" lang="en">{AIDE_CONTEXT_EXAMPLE_QUESTION}</p>
          <PreviewLabel>{t('settings.aideDialog.context.preview.attached')}</PreviewLabel>
          {items.length
            ? items.map((item) => <PreviewSegment item={item} key={item.key} />)
            : <p className="mx-[18px] text-ui-md text-foreground/50">{t('settings.aideDialog.context.preview.empty')}</p>}
        </div>
      </div>
    </section>
  );
}

function PreviewLabel({ children }: { children: string }) {
  return <b className="mx-[18px] mb-1 mt-2 block text-ui-sm font-semibold leading-[18px] text-foreground/55">{children}</b>;
}

function PreviewSegment({ item }: { item: AideAllocatedContextItem }) {
  const t = useTranslation();
  return (
    <div className="mx-1.5 border-t border-settings-divider/60 px-3 py-2.5 first-of-type:border-t-0" data-preview-item={item.key}>
      <div className="mb-0.5 text-ui-sm font-semibold leading-[18px] text-foreground/50">{t(aideContextItemTitleKey(item.key))}</div>
      {item.units.map((unit, index) => <PreviewUnit key={index} unit={unit} />)}
      {item.truncated ? <div className="mt-1 text-ui-sm text-foreground/45">{t('settings.aideDialog.context.preview.more')}</div> : null}
    </div>
  );
}

function PreviewUnit({ unit }: { unit: AideContextUnit }) {
  const t = useTranslation();
  const labelKey = unit.label ? LABEL_KEYS[unit.label.replace(/(\s*\(edited\))?:\s*$/u, '')] : undefined;
  const label = labelKey ? t(`settings.aideDialog.context.preview.label.${labelKey}` as TranslationKey) : unit.label?.trim();
  const current = unit.text.endsWith(CURRENT_MARKER);
  const text = current ? unit.text.slice(0, -CURRENT_MARKER.length) : unit.text;
  return (
    <div className="mt-1 first:mt-0">
      {label ? <div className="text-ui-sm font-semibold leading-[18px] text-foreground/55">{label}</div> : null}
      <div className="whitespace-pre-wrap break-words text-ui-md leading-[22px] text-foreground/85" lang="en">
        {text}{current ? <span lang={undefined}>{t('settings.aideDialog.context.preview.current')}</span> : null}
      </div>
    </div>
  );
}
