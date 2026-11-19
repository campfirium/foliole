import { Fragment, useId, useState } from 'react';

import {
  isValidSuperMemoReferenceMap, mappedSuperMemoReferences, SUPER_MEMO_REFERENCE_FIELDS, type SuperMemoReferenceMap
} from '../../../../lib/core/import/superMemoReferenceFields';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppInput } from '../../../shared/ui';
import { getFrontmatterMetaFields, parseFrontmatterMetaFieldGroups } from '../../editor/model/frontmatterMetaFieldsSetting';

const sample = {
  Title: 'Foliole', Author: 'Campfirium', Link: 'https://foliole.app/',
  Date: '2026-02-25', Source: 'https://github.com/campfirium/foliole', Comment: ''
};

function referenceValue(value: string) {
  if (!/^https?:\/\//iu.test(value)) return value;
  const segments = value.match(/^https?:\/\/[^/]+\/*|[^/]+\/*/giu) ?? [value];
  return segments.map((segment, index) => <Fragment key={index}>
    {index > 0 ? <wbr /> : null}{segment}
  </Fragment>);
}

function ReferencePreview({ entries }: { entries: [string, string][] }) {
  const t = useTranslation();
  const yamlId = useId();
  const [expanded, setExpanded] = useState(false);
  const values = new Map(entries.map(([key, value]) => [key.toLowerCase(), value]));
  const groups = parseFrontmatterMetaFieldGroups(getFrontmatterMetaFields());
  return <article aria-label={t('desktop.superMemoDrafts.referencePreview')}
    className="min-w-0 border-l border-settings-divider pl-3 sm:pl-5">
    <h5 className="text-sm font-medium text-foreground/75">{t('desktop.superMemoDrafts.referencePreview')}</h5>
    <h6 className="mt-3 text-base font-semibold">{sample.Title}</h6>
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm font-medium text-foreground/75">
      {groups.map((group, index) => {
        const value = group.map(key => values.get(key.toLowerCase())).find(Boolean);
        if (!value) return null;
        const url = /^https?:\/\//iu.test(value) ? URL.parse(value) : null;
        return <span key={index} className="break-all" title={url ? value : undefined}>{url?.hostname ?? value}</span>;
      })}
      <button type="button" className="rounded-sm hover:text-foreground focus-visible:outline focus-visible:outline-offset-2"
        aria-controls={yamlId} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? t('desktop.editor.frontmatter.close') : 'meta'}
      </button>
    </div>
    <pre id={yamlId} hidden={!expanded}
      className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-sm border border-settings-divider bg-foreground/5 px-2.5 py-2 font-mono text-sm leading-snug text-foreground/80">
      {'---\n'}
      {entries.map(([key, value], index) => <Fragment key={index}>
        {`${key}: `}{referenceValue(value)}{'\n'}
      </Fragment>)}
      {'---'}
    </pre>
    <p className="mt-2 text-sm leading-snug text-foreground/80">{t('desktop.superMemoDrafts.referencePreviewHelp')}</p>
  </article>;
}

function ReferenceMapping({ mapping, onChange, disabled }: {
  mapping: SuperMemoReferenceMap; onChange(next: SuperMemoReferenceMap): void; disabled: boolean;
}) {
  const t = useTranslation();
  return <table className="w-full table-fixed text-sm">
    <thead className="text-left text-foreground/75">
      <tr>
        <th className="w-[24%] pr-2 pb-2 font-medium" scope="col">{t('desktop.superMemoDrafts.referenceSourceField')}</th>
        <th className="w-[36%] px-1 pb-2 font-medium sm:px-2" scope="col">{t('desktop.superMemoDrafts.referenceSample')}</th>
        <th className="pl-1 pb-2 font-medium sm:pl-2" scope="col">{t('desktop.superMemoDrafts.referenceTargetField')}</th>
      </tr>
    </thead>
    <tbody>
      {SUPER_MEMO_REFERENCE_FIELDS.filter(field => field !== 'Article').map(field => <tr key={field} className="border-t border-settings-divider">
        <th className="py-1 pr-2 text-left font-medium" scope="row">{field}</th>
        <td className="[overflow-wrap:anywhere] px-1 py-1 leading-tight text-foreground/75 sm:px-2" title={sample[field] || undefined}>
          {sample[field] ? referenceValue(sample[field]) : '—'}
        </td>
        <td className="pl-1 py-0.5 sm:pl-2 [@media(min-height:880px)]:py-1.5">
          <AppInput className="h-8 px-2.5 py-0 text-sm" value={mapping[field] ?? field} maxLength={64} disabled={disabled}
            aria-label={t('desktop.superMemoDrafts.referenceKey', { field })}
            onChange={event => onChange({ ...mapping, [field]: event.target.value })} />
        </td>
      </tr>)}
    </tbody>
  </table>;
}

export function SuperMemoReferenceSettings({ mapping, onChange, disabled }: {
  mapping: SuperMemoReferenceMap; onChange(next: SuperMemoReferenceMap): void; disabled: boolean;
}) {
  const t = useTranslation();
  return <section className="grid min-w-0 gap-2.5 border-t border-settings-divider pt-3 [@media(min-height:880px)]:pt-4">
    <h4 className="text-base font-semibold">{t('desktop.superMemoDrafts.references')}</h4>
    <p className="text-sm leading-snug text-foreground/75">{t('desktop.superMemoDrafts.referencesHelp')}</p>
    <div className="grid min-w-0 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-stretch gap-3 sm:gap-5">
      <div className="min-w-0">
        <ReferenceMapping mapping={mapping} disabled={disabled} onChange={onChange} />
        {!isValidSuperMemoReferenceMap(mapping) ? <p role="alert"
          className="mt-1 text-xs text-destructive">{t('desktop.superMemoDrafts.referenceInvalid')}</p> : null}
      </div>
      <ReferencePreview entries={mappedSuperMemoReferences(mapping, sample)} />
    </div>
  </section>;
}
