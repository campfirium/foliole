import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsControlValueClassName,
  settingsRangeClassName
} from '../../../../shared/ui';
import {
  settingsSearchRowProps,
  type SettingsSearchRowMeta
} from '../../model/settingsSearch';
import { createSettingsSearchRows } from '../../model/settingsSearchRowCatalog';

import {
  DefaultPriorityControl,
  NewDayStartControl,
  QueueMixRatioControl,
  ReadingGrowthFactorRangeControl,
  ReviewNumberInput
} from './reviewSettingsControls';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface SettingsReviewRowsProps {
  desiredRetention: number;
  maximumIntervalDays: number;
  newDayStartsAtHour: number;
  defaultPriority: number;
  priorityRatio: number;
  queueMixRatioReading: number;
  queueMixRatioFsrs: number;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorMin: number;
  readingIntervalGrowthFactorMax: number;
  onDesiredRetentionChange: (value: number) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onNewDayStartsAtHourChange: (value: number) => void;
  onDefaultPriorityChange: (value: number) => void;
  onPriorityRatioChange: (value: number) => void;
  onQueueMixRatioReadingChange: (value: number) => void;
  onQueueMixRatioFsrsChange: (value: number) => void;
  onReadingInitialIntervalDaysChange: (value: number) => void;
  onReadingIntervalGrowthFactorMinChange: (value: number) => void;
  onReadingIntervalGrowthFactorMaxChange: (value: number) => void;
}

interface ReviewSettingRowProps {
  control: ReactNode;
  description: string;
  searchRow?: SettingsSearchRowMeta;
  title: string;
}

function getReviewRows(t: ReturnType<typeof useTranslation>) {
  const rows = createSettingsSearchRows(t).filter((row) => row.categoryId === 'review');
  return {
    defaultTopicPriority: rows[3]!,
    desiredRetention: rows[0]!,
    maximumInterval: rows[1]!,
    newDayStartsAt: rows[2]!,
    priorityWeight: rows[5]!,
    readingInitialInterval: rows[6]!,
    readingIntervalGrowth: rows[7]!,
    readingVsReviewMix: rows[4]!
  };
}

function ReviewSettingRow({ title, description, control, searchRow }: ReviewSettingRowProps) {
  return (
    <SettingsRow
      {...(searchRow ? settingsSearchRowProps(searchRow) : {})}
      description={description}
      title={title}
    >
      {control}
    </SettingsRow>
  );
}

export function SchedulerCoreRows(props: Pick<
  SettingsReviewRowsProps,
  | 'desiredRetention'
  | 'maximumIntervalDays'
  | 'newDayStartsAtHour'
  | 'onDesiredRetentionChange'
  | 'onMaximumIntervalDaysChange'
  | 'onNewDayStartsAtHourChange'
>) {
  const t = useTranslation();
  const rows = getReviewRows(t);
  return (
    <>
      <ReviewSettingRow
        searchRow={rows.desiredRetention}
        title={rows.desiredRetention.title}
        description={t('settings.review.desiredRetention.description')}
        control={
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <input
              aria-label={t('settings.review.desiredRetention.aria')}
              className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
              max={0.99}
              min={0.01}
              onChange={(event) => props.onDesiredRetentionChange(Number(event.target.value))}
              step={0.01}
              type="range"
              value={props.desiredRetention}
            />
            <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{props.desiredRetention.toFixed(2)}</span>
          </SettingsControlSlot>
        }
      />
      <ReviewSettingRow
        searchRow={rows.maximumInterval}
        title={rows.maximumInterval.title}
        description={t('settings.review.maximumInterval.description')}
        control={
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <span className="sr-only">{t('settings.review.maximumInterval.aria')}</span>
            <ReviewNumberInput ariaLabel={t('settings.review.maximumInterval.aria')} min={1} onChange={props.onMaximumIntervalDaysChange} step={1} value={props.maximumIntervalDays} />
          </SettingsControlSlot>
        }
      />
      <ReviewSettingRow
        searchRow={rows.newDayStartsAt}
        title={rows.newDayStartsAt.title}
        description={rows.newDayStartsAt.description}
        control={<NewDayStartControl ariaLabel={t('settings.review.newDayStartsAt.aria')} onChange={props.onNewDayStartsAtHourChange} value={props.newDayStartsAtHour} />}
      />
    </>
  );
}

export function PushQueueRows(props: Pick<
  SettingsReviewRowsProps,
  | 'defaultPriority'
  | 'priorityRatio'
  | 'queueMixRatioReading'
  | 'queueMixRatioFsrs'
  | 'readingInitialIntervalMs'
  | 'readingIntervalGrowthFactorMin'
  | 'readingIntervalGrowthFactorMax'
  | 'onDefaultPriorityChange'
  | 'onPriorityRatioChange'
  | 'onQueueMixRatioReadingChange'
  | 'onQueueMixRatioFsrsChange'
  | 'onReadingInitialIntervalDaysChange'
  | 'onReadingIntervalGrowthFactorMinChange'
  | 'onReadingIntervalGrowthFactorMaxChange'
>) {
  const readingInitialIntervalDays = Number((props.readingInitialIntervalMs / DAY_IN_MS).toFixed(2));
  const t = useTranslation();
  const rows = getReviewRows(t);
  return (
    <>
      <ReviewSettingRow
        searchRow={rows.defaultTopicPriority}
        title={rows.defaultTopicPriority.title}
        description={rows.defaultTopicPriority.description}
        control={<DefaultPriorityControl absoluteLabel={t('settings.review.priorityAbsolute')} ariaLabel={t('settings.review.defaultPriority.aria')} onChange={props.onDefaultPriorityChange} value={props.defaultPriority} />}
      />
      <ReviewSettingRow
        searchRow={rows.readingVsReviewMix}
        title={rows.readingVsReviewMix.title}
        description={rows.readingVsReviewMix.description}
        control={<QueueMixRatioControl fsrs={props.queueMixRatioFsrs} fsrsAriaLabel={t('settings.review.itemQueueMix.aria')} onFsrsChange={props.onQueueMixRatioFsrsChange} onReadingChange={props.onQueueMixRatioReadingChange} reading={props.queueMixRatioReading} readingAriaLabel={t('settings.review.readingQueueMix.aria')} />}
      />
      <ReviewSettingRow
        searchRow={rows.priorityWeight}
        title={rows.priorityWeight.title}
        description={rows.priorityWeight.description}
        control={<SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}><ReviewNumberInput ariaLabel={t('settings.review.priorityWeight.aria')} min={1} onChange={props.onPriorityRatioChange} step={0.1} value={props.priorityRatio} /></SettingsControlSlot>}
      />
      <ReviewSettingRow
        searchRow={rows.readingInitialInterval}
        title={rows.readingInitialInterval.title}
        description={rows.readingInitialInterval.description}
        control={<SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}><ReviewNumberInput ariaLabel={t('settings.review.readingInitialInterval.aria')} min={0.01} onChange={props.onReadingInitialIntervalDaysChange} step={0.25} value={readingInitialIntervalDays} /></SettingsControlSlot>}
      />
      <ReviewSettingRow
        searchRow={rows.readingIntervalGrowth}
        title={rows.readingIntervalGrowth.title}
        description={rows.readingIntervalGrowth.description}
        control={<ReadingGrowthFactorRangeControl maxAriaLabel={t('settings.review.readingGrowthMax.aria')} maxValue={props.readingIntervalGrowthFactorMax} minAriaLabel={t('settings.review.readingGrowthMin.aria')} minValue={props.readingIntervalGrowthFactorMin} onMaxChange={props.onReadingIntervalGrowthFactorMaxChange} onMinChange={props.onReadingIntervalGrowthFactorMinChange} rangeLabel={t('settings.review.rangeTo')} />}
      />
    </>
  );
}
