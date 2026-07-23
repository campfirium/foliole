import { Eraser, List, TextCursorInput, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { NativeFoliolePublishField, NativeFoliolePublishFieldCatalogEntry } from '../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppIconButton, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import { DiscourseShortcutGrid } from './DiscourseShortcutPicker';
import { addFoliolePublishField, parseMultipleValue } from './foliolePublishDialogModel';
import { FoliolePublishMultipleValueInput } from './FoliolePublishFieldValueInput';
import { FoliolePublishSingleValuePicker } from './FoliolePublishSingleValuePicker';

function FieldAction(props: { disabled?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild><AppIconButton disabled={props.disabled} icon={props.icon} label={props.label} onClick={props.onClick} /></AppTooltipTrigger>
      <AppTooltipContent>{props.label}</AppTooltipContent>
    </AppTooltip>
  );
}

function toggleFieldValue(field: NativeFoliolePublishField): NativeFoliolePublishField {
  return {
    key: field.key,
    value: Array.isArray(field.value) ? field.value.join(', ') : parseMultipleValue(field.value)
  };
}

function suggestionsForField(field: NativeFoliolePublishField, catalog: NativeFoliolePublishFieldCatalogEntry[]) {
  const history = catalog.find((entry) => entry.key === field.key)?.recent_values ?? [];
  const values = [field.value, ...history].flatMap((value) => Array.isArray(value) ? value : [value]);
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 9);
}

export function FoliolePublishFields(props: {
  choices: NativeFoliolePublishField[];
  fieldCatalog: NativeFoliolePublishFieldCatalogEntry[];
  fields: NativeFoliolePublishField[];
  onChange: (fields: NativeFoliolePublishField[]) => void;
  onForget: (key: string) => void;
  onResetHistory: () => void;
}) {
  const t = useTranslation();
  const update = (index: number, field: NativeFoliolePublishField) => props.onChange(props.fields.map((item, i) => i === index ? field : item));
  const addBlank = () => {
    let index = 1;
    while (props.fields.some((field) => field.key === `field_${index}`)) index += 1;
    props.onChange([...props.fields, { key: `field_${index}`, value: '' }]);
  };
  const choices = props.choices.filter((choice) => !props.fields.some((field) => field.key === choice.key));
  return (
    <div className="mt-5 grid gap-5">
      {props.fields.map((field, index) => {
        const multiple = Array.isArray(field.value);
        const suggestions = suggestionsForField(field, props.fieldCatalog);
        const toggleLabel = t(multiple ? 'desktop.foliolePublish.switchToSingle' : 'desktop.foliolePublish.switchToMultiple');
        return (
          <section className="group grid gap-1.5" key={`${field.key}-${index}`}>
            <div className="flex min-h-8 items-center gap-1.5">
              <input aria-label={t('desktop.foliolePublish.keyPlaceholder')} className="min-w-0 flex-1 border-0 bg-transparent text-sm capitalize text-foreground/68 outline-none focus:text-foreground" onChange={(event) => update(index, { ...field, key: event.target.value })} spellCheck={false} value={field.key} />
              <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <FieldAction icon={multiple ? <TextCursorInput aria-hidden size={15} /> : <List aria-hidden size={15} />} label={toggleLabel} onClick={() => update(index, toggleFieldValue(field))} />
                <FieldAction disabled={!props.fieldCatalog.some((entry) => entry.key === field.key)} icon={<Eraser aria-hidden size={15} />} label={t('desktop.foliolePublish.forget')} onClick={() => props.onForget(field.key)} />
                <FieldAction icon={<Trash2 aria-hidden size={15} />} label={t('desktop.foliolePublish.remove')} onClick={() => props.onChange(props.fields.filter((_, i) => i !== index))} />
              </div>
            </div>
            {multiple ? (
              <FoliolePublishMultipleValueInput onChange={(value) => update(index, { key: field.key, value })} suggestions={suggestions} value={Array.isArray(field.value) ? field.value : []} />
            ) : (
              <FoliolePublishSingleValuePicker field={field.key} onChange={(value) => update(index, { key: field.key, value })} suggestions={suggestions} value={Array.isArray(field.value) ? '' : field.value} />
            )}
          </section>
        );
      })}
      {choices.length > 0 ? <DiscourseShortcutGrid items={choices.map((field) => ({ id: field.key, label: field.key }))} onMore={() => undefined} onSelect={(item) => {
        const selected = choices.find((field) => field.key === item.id);
        if (selected) props.onChange(addFoliolePublishField(props.fields, selected));
      }} /> : null}
      <div className="flex gap-2">
        <AppButton onClick={addBlank} variant="subtle">{t('desktop.foliolePublish.addField')}</AppButton>
        <AppButton disabled={props.fieldCatalog.length === 0} onClick={props.onResetHistory} variant="subtle">{t('desktop.foliolePublish.resetHistory')}</AppButton>
      </div>
    </div>
  );
}
