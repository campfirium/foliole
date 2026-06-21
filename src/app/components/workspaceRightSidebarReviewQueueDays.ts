import type { Translate } from '../../shared/localization/LocalizationProvider';

export function getDemoDisplayDay(dayOffset: number) {
  return dayOffset + 1;
}

export function getDemoPreviewDisplayDay(previewDay: number) {
  return previewDay + 1;
}

export function getDemoDayHeading(dayOffset: number, t: Translate) {
  return t('desktop.rightPanel.flow.demo.dayGroup', { day: getDemoDisplayDay(dayOffset) });
}
