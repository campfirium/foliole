import type { NativeFoliolePublishField } from '../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppInput } from '../../shared/ui';

import { DiscourseShortcutGrid } from './DiscourseShortcutPicker';
import { addFoliolePublishField, parseMultipleValue } from './foliolePublishDialogModel';

export function FoliolePublishFields(props: {
  choices: NativeFoliolePublishField[];
  fields: NativeFoliolePublishField[];
  historyKeys: Set<string>;
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
    <div className="mt-5 grid gap-4">
      <div className="text-sm text-foreground/68">{t('desktop.foliolePublish.fields')}</div>
      {props.fields.map((field, index) => {
        const multiple = Array.isArray(field.value);
        return (
          <div className="grid grid-cols-[minmax(130px,0.8fr)_130px_minmax(180px,1.4fr)_auto_auto] gap-2" key={`${field.key}-${index}`}>
            <AppInput aria-label={t('desktop.foliolePublish.keyPlaceholder')} onChange={(event) => update(index, { ...field, key: event.target.value })} value={field.key} />
            <AppButton onClick={() => update(index, { key: field.key, value: multiple ? '' : [] })} variant="subtle">
              {t(multiple ? 'desktop.foliolePublish.multiple' : 'desktop.foliolePublish.single')}
            </AppButton>
            <AppInput
              aria-label={t(multiple ? 'desktop.foliolePublish.valuesPlaceholder' : 'desktop.foliolePublish.valuePlaceholder')}
              onChange={(event) => update(index, { key: field.key, value: multiple ? parseMultipleValue(event.target.value) : event.target.value })}
              placeholder={t(multiple ? 'desktop.foliolePublish.valuesPlaceholder' : 'desktop.foliolePublish.valuePlaceholder')}
              value={Array.isArray(field.value) ? field.value.join(', ') : field.value}
            />
            <AppButton onClick={() => props.onChange(props.fields.filter((_, i) => i !== index))} variant="subtle">{t('desktop.foliolePublish.remove')}</AppButton>
            <AppButton disabled={!props.historyKeys.has(field.key)} onClick={() => props.onForget(field.key)} variant="subtle">{t('desktop.foliolePublish.forget')}</AppButton>
          </div>
        );
      })}
      {choices.length > 0 ? <DiscourseShortcutGrid items={choices.map((field) => ({ id: field.key, label: field.key }))} onMore={() => undefined} onSelect={(item) => {
        const selected = choices.find((field) => field.key === item.id);
        if (selected) props.onChange(addFoliolePublishField(props.fields, selected));
      }} /> : null}
      <div className="flex gap-2">
        <AppButton onClick={addBlank} variant="subtle">{t('desktop.foliolePublish.addField')}</AppButton>
        <AppButton disabled={props.historyKeys.size === 0} onClick={props.onResetHistory} variant="subtle">{t('desktop.foliolePublish.resetHistory')}</AppButton>
      </div>
    </div>
  );
}
