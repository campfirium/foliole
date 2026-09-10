import type {
  ReadwiseAutoImportPolicy,
  ReadwiseImportDestination
} from '../../../lib/core/import/readwiseAutoImportPolicy';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { SettingsChoiceMatrix, SettingsSegmentedControl } from '../../shared/ui';

type PolicyField = Exclude<keyof ReadwiseAutoImportPolicy, 'version'>;

export function ReadwiseReaderImportBehavior(props: {
  onChange: (field: PolicyField, value: ReadwiseImportDestination) => void;
  policy: ReadwiseAutoImportPolicy;
}) {
  const t = useTranslation();
  const options: Array<{ label: string; value: ReadwiseImportDestination }> = [
    { label: t('desktop.readwise.destination.inbox'), value: 'inbox' },
    { label: t('desktop.readwise.destination.external'), value: 'external' },
    { label: t('desktop.readwise.destination.off'), value: 'off' }
  ];
  function control(field: PolicyField, ariaLabel: string) {
    return (
      <SettingsSegmentedControl
        ariaLabel={ariaLabel}
        onChange={(value) => props.onChange(field, value as ReadwiseImportDestination)}
        options={options}
        value={props.policy[field]}
      />
    );
  }
  return (
    <SettingsChoiceMatrix
      ariaLabel={t('desktop.readwise.section.behavior.aria')}
      columns={[
        t('desktop.readwise.behavior.withHighlights.title'),
        t('desktop.readwise.behavior.withoutHighlights.title')
      ]}
      rows={[
        {
          cells: [
            control('articleWithHighlights', t('desktop.readwise.behavior.article.withHighlights.aria')),
            control('articleWithoutHighlights', t('desktop.readwise.behavior.article.withoutHighlights.aria'))
          ],
          label: t('desktop.readwise.behavior.article.title')
        },
        {
          cells: [
            control('bookWithHighlights', t('desktop.readwise.behavior.book.withHighlights.aria')),
            control('bookWithoutHighlights', t('desktop.readwise.behavior.book.withoutHighlights.aria'))
          ],
          label: t('desktop.readwise.behavior.book.title')
        }
      ]}
    />
  );
}
